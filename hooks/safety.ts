/**
 * pi-shazam hooks/safety -- Safety gate for bash commands.
 *
 * Provides two safety features:
 * 1. Destructive command detection -- shows confirmation dialog for dangerous commands
 * 2. Pre-commit gate -- blocks git commit if shazam_verify was not run recently
 *
 * Uses Pi's ctx.ui.confirm() for interactive confirmation.
 * Uses shared verify-state module for reliable verify detection.
 */

import type { ExtensionAPI } from "../types/pi-extension.js";
import { hasRecentPassingVerify } from "./verify-state.js";
import { tokenizeSegments, extractCommandFromEvent } from "./_bash-utils.js";
import { _logWarn } from "../core/output.js";

/**
 * HIGH-risk — destructive commands that cause IRREVERSIBLE data loss.
 * These ALWAYS trigger confirmation: rm -rf (force-recursive delete),
 * dd (write block device), mkfs/mkswap (format filesystem).
 *
 * rm regex requires BOTH -r/--recursive AND -f/--force in some combination
 * (short flags combined like -rf, separate short flags, or long flags).
 * Bare --recursive without --force is NOT high risk (rm prompts per file).
 *
 * Patterns intentionally excluded (not directly destructive despite being
 * risky in other contexts): eval, source/., curl|sh, fork bomb, backtick
 * substitution, process substitution — these are common in daily agent
 * operations and do not directly destroy data.
 */
const HIGH_RISK_PATTERNS: Array<{ regex: RegExp; label: string }> = [
	{
		regex:
			/rm\s+(-[a-z]*[rf][a-z]*[rf][a-z]*|-[a-z]*[rf][a-z]*\s+-[a-z]*[rf][a-z]*|--recursive\s+.*--force|--force\s+.*--recursive)\b/,
		label: "rm -rf",
	},
	{ regex: /dd\s+if=/, label: "dd if=" },
	{ regex: /\bmkfs\b/, label: "mkfs" },
	{ regex: /\bmkswap\b/, label: "mkswap" },
];

/**
 * MEDIUM-risk — configuration/system damage that is recoverable but
 * potentially severe. These trigger confirmation but can proceed in
 * non-interactive mode.
 *
 * Includes: chmod 777 /, chmod -R 777, chown -R (permission damage),
 * > /dev/sd* (write block device), LVM operations, iptables,
 * and rm -r / (recursive delete on root, without -f).
 *
 * Partition tools (fdisk/parted/sfdisk) are handled via argv-based detection
 * in detectDestructiveCommand() to allow read-only operations (-l, print).
 */
const MEDIUM_RISK_PATTERNS: Array<{ regex: RegExp; label: string }> = [
	// Permission damage (regexes lowercase because tested against toLowerCase())
	{ regex: /chmod\s+(-r\s+)?777\s+\//, label: "chmod 777 /" },
	{ regex: /chmod\s+-r\s+777/, label: "chmod -R 777" },
	{ regex: /chown\s+-r\b/, label: "chown -R" },
	// Direct block device writes
	{ regex: />\s*\/dev\/sd/, label: "> /dev/sd" },
	{ regex: />\s*\/dev\/nvme/, label: "> /dev/nvme" },
	{ regex: />\s*\/dev\/mmcblk/, label: "> /dev/mmcblk" },
	// LVM operations
	{ regex: /\bpvcreate\b/, label: "pvcreate" },
	{ regex: /\bvgcreate\b/, label: "vgcreate" },
	{ regex: /\blvcreate\b/, label: "lvcreate" },
	// Firewall (regexes lowercase because tested against toLowerCase())
	{ regex: /iptables\s+-f\b/, label: "iptables -F" },
	{ regex: /iptables\s+-p\b/, label: "iptables -P" },
	// Recursive delete on root (without -f — less severe than HIGH rm -rf)
	// Covered by argv detection for rm; kept as regex fallback for non-standard invocations
	{
		regex: /rm\s+(-[a-z]*[rf][a-z]*[rf][a-z]*|-[a-z]*[rf][a-z]*\s+-[a-z]*[rf][a-z]*|--recursive|-r[a-z]*)\s+\//,
		label: "rm -r /",
	},
];

/**
 * Git commit pattern for pre-commit gate.
 */
/**
 * Strip bodies of QUOTED bash heredocs from the command string.
 *
 * Quoted heredocs (<<'DELIM' or <<"DELIM", with optional dash <<-)
 * perform NO shell expansion inside the body -- all characters are
 * literal. Stripping them before pattern matching eliminates false
 * positives when the body contains text that looks like dangerous
 * shell constructs (e.g. backticks in Markdown code blocks, "eval"
 * in documentation, curl-pipe-sh examples).
 *
 * Unquoted heredocs (<<DELIM, $ and backtick still expand) are NOT
 * stripped -- they can still execute arbitrary code.
 *
 * Handles multiple heredocs and unterminated heredocs (gracefully
 * falls back to the original command).
 */
function stripQuotedHeredocs(cmd: string): string {
	// Match <<'DELIM' or <<-"DELIM" -- optional dash, single or double quotes.
	// Delimiter: starts with letter/underscore, then alphanumeric/underscore/hyphen.
	const startRe = /<<-?(['"])([a-zA-Z_][a-zA-Z0-9_-]*)\1/g;

	let result = "";
	let lastEnd = 0;
	let match: RegExpExecArray | null;

	while ((match = startRe.exec(cmd)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		const delim = match[2]!;

		// Search for closing delimiter on its own line (possibly with
		// leading tabs when <<- was used). Bash requires the closing
		// delimiter at the start of a line; optional tabs accommodate
		// the tab-stripping <<- variant.
		const afterHeredoc = cmd.slice(matchEnd);
		const closeRe = new RegExp(`^\\t*${escapeRegex(delim)}$`, "m");
		const closeMatch = closeRe.exec(afterHeredoc);

		if (closeMatch) {
			// Append content before the heredoc start
			result += cmd.slice(lastEnd, matchStart);
			// Skip the heredoc body (from <<'DELIM' through the closing delimiter line)
			const closeEnd = matchEnd + closeMatch.index + closeMatch[0].length;
			lastEnd = closeEnd;
			startRe.lastIndex = closeEnd;
		} else {
			// Unterminated heredoc -- bail out, keep the original command
			break;
		}
	}

	if (lastEnd > 0) {
		result += cmd.slice(lastEnd);
		return result;
	}
	return cmd;
}

/**
 * Strip bodies of single-quoted strings from the command.
 *
 * In bash, single quotes ('...') prevent ALL shell expansion including
 * backtick substitution, variable expansion ($var, $(cmd)), and globbing.
 * Backticks and other dangerous patterns inside single quotes are literal
 * characters and safe.
 *
 * Stripping single-quoted content before pattern matching eliminates
 * false positives from literal text inside command arguments (e.g. gh issue
 * create --body 'Fix `bug` in README').
 *
 * Double-quoted strings ("...") are NOT stripped -- they still allow
 * backtick and variable expansion.
 */
function stripSingleQuotedStrings(cmd: string): string {
	// Single quotes in bash: everything between them is literal.
	// No escaping possible inside single quotes (not even \').
	// Replace the entire quoted body with an empty pair '' so the
	// structural boundary is preserved but inner content is removed.
	return cmd.replace(/'[^']*'/g, "''");
}

/** Escape regex meta-characters in a literal string. */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize whitespace in a command string: collapse tabs and multiple spaces
 * to a single space, then trim. This prevents bypass via extra spaces or tabs.
 */
function normalizeWhitespace(cmd: string): string {
	return cmd
		.replace(/[\t\r]+/g, " ")
		.replace(/ {2,}/g, " ")
		.trim();
}

/**
 * Check if a short flag token (e.g. -rfv, -l) contains a given flag character.
 * Returns true for combined flags like -rf containing 'r' or 'f'.
 */
function _shortFlagHas(token: string, ch: string): boolean {
	if (!token.startsWith("-") || token.startsWith("--")) return false;
	return [...token.slice(1)].includes(ch);
}

/**
 * Check if argv contains a given flag. Handles:
 * - Short flag: -r (checks combined flags like -rfv)
 * - Long flag: --recursive
 */
function _argvHasFlag(argv: string[], shortCh: string | null, longFlag: string | null): boolean {
	return argv.some((a) => {
		if (longFlag && a === longFlag) return true;
		if (shortCh && _shortFlagHas(a, shortCh)) return true;
		return false;
	});
}

/**
 * Check if any non-option argument in argv is the root path "/".
 * Skips argv[0] (command name) and flags/option-arguments.
 */
function _argvTargetsRoot(argv: string[]): boolean {
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--") {
			// Everything after -- is positional
			for (let j = i + 1; j < argv.length; j++) {
				if (argv[j] === "/") return true;
			}
			return false;
		}
		if (a === "/") return true;
	}
	return false;
}

/**
 * Find the segment containing a command matching the given name(s),
 * skipping common prefixes like sudo/nice/command.
 * Returns the argv segment starting from the command itself (prefix stripped), or null.
 */
function _findCommandSegment(segments: string[][], ...names: string[]): string[] | null {
	const PREFIXES = new Set(["sudo", "nice", "command", "busybox", "ionice", "chroot", "strace", "timeout"]);
	for (const seg of segments) {
		if (seg.length === 0) continue;
		const cmd0 = seg[0]?.toLowerCase() ?? "";
		// Direct match on seg[0]
		if (names.some((n) => cmd0 === n || cmd0.endsWith("/" + n))) {
			return seg;
		}
		// Match after known prefix (sudo, nice, etc.)
		if (seg.length > 1 && PREFIXES.has(cmd0)) {
			const cmd1 = seg[1]?.toLowerCase() ?? "";
			if (names.some((n) => cmd1 === n || cmd1.endsWith("/" + n))) {
				return seg.slice(1);
			}
		}
	}
	return null;
}

/**
 * Check if a parted command line is read-only (contains "print" subcommand).
 */
function _isPartedReadOnly(argv: string[]): boolean {
	// parted [opts] [device [cmd]] -- if "print" appears as a positional arg, it's read-only.
	// Parted flags: -h/-v/-l/-m/-s (-s is script mode, but if cmd is print it's still read-only)
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === "print") return true;
		if (a === "--") break;
	}
	return false;
}

/**
 * Check if a command matches any destructive pattern.
 * Uses argv-based parsing for robust matching with precise flag detection.
 * Returns the risk level and matched pattern, or null if safe.
 */
function detectDestructiveCommand(cmd: string): { level: "HIGH" | "MEDIUM"; pattern: string } | null {
	// Strip quoted heredoc bodies and single-quoted string bodies before
	// pattern matching to prevent false positives from literal text inside
	// <<'EOF' ... EOF blocks or 'single-quoted arguments'.
	const stripped = stripQuotedHeredocs(cmd);
	const sqStripped = stripSingleQuotedStrings(stripped);
	const normalized = normalizeWhitespace(sqStripped);
	const lower = normalized.toLowerCase();

	// Parse into segments for per-command analysis (handles sudo prefix, chained cmds)
	const segments = tokenizeSegments(cmd);

	// --- rm: argv-based precise detection ---
	// Only flag rm -rf (force+recursive) as HIGH, rm -r / as MEDIUM.
	// Plain rm -r ./subdir (no force, not root) is safe in dev workflows.
	const rmSeg = _findCommandSegment(segments, "rm");
	if (rmSeg) {
		const hasRecursive = _argvHasFlag(rmSeg, "r", "--recursive") || _argvHasFlag(rmSeg, "R", null);
		const hasForce = _argvHasFlag(rmSeg, "f", "--force");
		const targetsRoot = _argvTargetsRoot(rmSeg);

		if (hasRecursive && hasForce) {
			return { level: "HIGH", pattern: "rm -rf" };
		}
		if (hasRecursive && targetsRoot) {
			return { level: "MEDIUM", pattern: "rm -r /" };
		}
		// hasRecursive but no force and not root: safe (rm prompts per file), no popup
	}

	// --- Partition tools: allow read-only operations ---
	const fdiskSeg = _findCommandSegment(segments, "fdisk");
	if (fdiskSeg) {
		// fdisk -l / fdisk --list = list partitions (read-only, safe)
		const isReadOnly = _argvHasFlag(fdiskSeg, "l", "--list");
		if (!isReadOnly) {
			return { level: "MEDIUM", pattern: "fdisk" };
		}
	}

	const sfdiskSeg = _findCommandSegment(segments, "sfdisk");
	if (sfdiskSeg) {
		// sfdisk -l (list), sfdisk -d (dump) = read-only, safe
		const isReadOnly = _argvHasFlag(sfdiskSeg, "l", "--list") || _argvHasFlag(sfdiskSeg, "d", "--dump");
		if (!isReadOnly) {
			return { level: "MEDIUM", pattern: "sfdisk" };
		}
	}

	const partedSeg = _findCommandSegment(segments, "parted");
	if (partedSeg) {
		// parted -l (list all), parted [dev] print = read-only, safe
		const isReadOnly = _argvHasFlag(partedSeg, "l", "--list") || _isPartedReadOnly(partedSeg);
		if (!isReadOnly) {
			return { level: "MEDIUM", pattern: "parted" };
		}
	}

	// Fallback to regex patterns for commands not covered by argv analysis
	for (const { regex, label } of HIGH_RISK_PATTERNS) {
		if (regex.test(lower)) {
			return { level: "HIGH", pattern: label };
		}
	}

	for (const { regex, label } of MEDIUM_RISK_PATTERNS) {
		if (regex.test(lower)) {
			return { level: "MEDIUM", pattern: label };
		}
	}

	return null;
}

/**
 * Register the safety hooks.
 *
 * Intercepts bash tool_call events to:
 * 1. Show confirmation dialog for destructive commands
 * 2. Block git commit if shazam_verify was not run
 */
export function registerSafetyHooks(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		// Only intercept bash commands
		if (event.toolName !== "bash") return;

		const cmd = extractCommandFromEvent(event);
		if (!cmd) return;

		// -- Check 1: Destructive command detection --
		const destructive = detectDestructiveCommand(cmd);
		if (destructive) {
			const levelTag = destructive.level === "HIGH" ? "HIGH" : "MED";
			const message = [
				`[${levelTag}] Destructive command detected [${levelTag}]`,
				"",
				`Risk level: ${destructive.level}`,
				`Pattern: ${destructive.pattern}`,
				`Command: ${cmd.slice(0, 200)}${cmd.length > 200 ? "..." : ""}`,
				"",
				"Do you want to continue?",
			].join("\n");

			try {
				const confirmed = await ctx.ui.confirm("Safety Warning", message);

				if (!confirmed) {
					return {
						block: true,
						reason: `Command blocked by safety check: ${destructive.pattern}`,
					};
				}

				// User confirmed, allow the command
				ctx.ui.notify(`Proceeding with ${destructive.level}-risk command...`, "warning");
			} catch (err) {
				// If confirm dialog fails (e.g., non-interactive mode), block high-risk
				_logWarn("registerSafetyHooks", "confirm dialog failed", err);
				if (destructive.level === "HIGH") {
					return {
						block: true,
						reason: `High-risk command blocked in non-interactive mode: ${destructive.pattern}`,
					};
				}
				// Allow medium-risk in non-interactive mode
			}

			return;
		}

		// -- Check 2: Pre-commit gate --
		// Auto-block commit when shazam_verify was not run recently.
		// #467: segment-aware detection. Previously only argv[0] was checked,
		// so a chained command like `echo safe && git commit` bypassed the
		// gate entirely (argv[0] was "echo"). Now scan every segment for a
		// `git commit` invocation so the gate fires regardless of any benign
		// prefix chained before the commit.
		const segments = tokenizeSegments(cmd);
		const gitCommitSeg = segments.find((seg) => seg[0] === "git" && seg.length >= 2 && seg[1] === "commit");
		if (gitCommitSeg) {
			// Skip if --no-verify or -n flag is present in the commit segment.
			// Scope the check to the commit segment so a benign `echo --no-verify`
			// chained before the commit cannot bypass the gate.
			// Use seg.some to handle combined short flags like -nq, -qn.
			const hasNoVerify =
				gitCommitSeg.includes("--no-verify") ||
				gitCommitSeg.some((a) => a.startsWith("-") && !a.startsWith("--") && a.includes("n"));
			if (hasNoVerify) {
				return;
			}

			if (!hasRecentPassingVerify()) {
				return {
					block: true,
					reason: [
						"Commit blocked: shazam_verify --preCommit has not passed.",
						"",
						"Run: shazam_verify --preCommit",
						"If it FAILs: fix the reported issues (type errors, new orphans, lint), then re-run verify.",
						"Once verify reports [PASS] READY: retry your commit.",
						"To skip this check: git commit --no-verify",
					].join("\n"),
				};
			}
		}

		return;
	});
}
