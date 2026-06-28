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
import { tokenizeCommand, tokenizeSegments, extractCommandFromEvent } from "./_bash-utils.js";
import { _logWarn } from "../core/output.js";

/**
 * HIGH-risk — destructive commands that cause IRREVERSIBLE data loss.
 * These ALWAYS trigger confirmation: rm -rf (delete), dd (write block device),
 * mkfs/mkswap (format filesystem).
 *
 * Patterns intentionally excluded (not directly destructive despite being
 * risky in other contexts): eval, source/., curl|sh, fork bomb, backtick
 * substitution, process substitution — these are common in daily agent
 * operations and do not directly destroy data.
 */
const HIGH_RISK_PATTERNS: Array<{ regex: RegExp; label: string }> = [
	{ regex: /rm\s+(-[a-z]*[rf][a-z]*[rf][a-z]*|-[a-z]*[rf][a-z]*\s+-[a-z]*[rf][a-z]*|--recursive)\b/, label: "rm -rf" },
	{ regex: /dd\s+if=/, label: "dd if=" },
	{ regex: /\bmkfs\b/, label: "mkfs" },
	{ regex: /\bmkswap\b/, label: "mkswap" },
];

/**
 * MEDIUM-risk — configuration/system damage that is recoverable but
 * potentially severe. These trigger confirmation but can proceed in
 * non-interactive mode.
 *
 * Includes: fdisk/parted/sfdisk (partitioning, demoted from HIGH),
 * chmod 777 /, chmod -R 777, chown -R (permission damage),
 * > /dev/sd* (write block device), LVM operations, iptables,
 * and rm -r / (recursive delete on root, without -f).
 */
const MEDIUM_RISK_PATTERNS: Array<{ regex: RegExp; label: string }> = [
	// Partition tools (demoted from HIGH — partitioning is recoverable)
	{ regex: /\bfdisk\b/, label: "fdisk" },
	{ regex: /\bparted\b/, label: "parted" },
	{ regex: /\bsfdisk\b/, label: "sfdisk" },
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
	// Recursive delete on root (without -f — less severe than HE rm -rf)
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
 * Check if a command matches any destructive pattern.
 * Uses argv-based parsing for robust matching.
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
	const argv = tokenizeCommand(cmd);

	// Check via argv for more precise detection
	const argv0 = argv[0]?.toLowerCase() ?? "";
	const isRm = argv0 === "rm" || argv0.endsWith("/rm");

	// rm detection: check for recursive flag
	if (isRm) {
		const hasRecursive = argv.some((a) => {
			if (a === "--recursive") return true;
			if (a === "-r" || a === "-R") return true;
			// Split combined short flags like -rfv, -Rf to check for individual r/R
			if (a.startsWith("-") && !a.startsWith("--") && a.length > 2) {
				return [...a.slice(1)].some((ch) => ch === "r" || ch === "R");
			}
			return false;
		});
		if (hasRecursive) {
			return { level: "HIGH", pattern: "rm -r" };
		}
	}

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
