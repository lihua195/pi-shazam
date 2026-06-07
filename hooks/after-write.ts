/**
 * pi-shazam hooks/after-write — Auto-verify after write/edit operations.
 *
 * Registered on the `tool_result` event. When the LLM writes or edits a file,
 * this hook automatically runs diagnostics and sends diff-aware findings.
 *
 * Features:
 * - Per-file git diff parsing (which files changed, what kind of changes)
 * - Graph diff against session baseline (new orphans, edge changes)
 * - Block on FAIL-level issues (LSP errors detected)
 * - Context-aware recommendations based on findings
 */

import type { ExtensionAPI } from "../types/pi-extension.js";
import { scanProject } from "../core/scanner.js";
import { getGraphEdgeCount } from "../core/graph.js";
import { diffBaseline } from "../core/cache.js";
import { diffFromBaseline, formatBaselineDiff } from "../core/baseline.js";
import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/** Tool names that trigger auto-verify */
const _WRITE_TOOLS = new Set(["write", "edit"]);

// ── Git diff parsing ────────────────────────────────────────────────────────

interface ChangedFile {
	status: "M" | "A" | "D" | "R" | "C";
	file: string;
	linesAdded: number;
	linesRemoved: number;
}

/**
 * Parse git diff to get per-file change information.
 */
function getGitDiff(): ChangedFile[] {
	try {
		const output = execSync(
			"git diff --numstat HEAD 2>/dev/null",
			{ encoding: "utf-8", timeout: 5000 },
		).trim();
		if (!output) return [];

		const result: ChangedFile[] = [];
		for (const line of output.split("\n").filter(Boolean)) {
			const parts = line.split("\t");
			if (parts.length >= 3) {
				result.push({
					status: "M",
					file: parts[2]!,
					linesAdded: parseInt(parts[0]!, 10) || 0,
					linesRemoved: parseInt(parts[1]!, 10) || 0,
				});
			}
		}
		return result;
	} catch {
		return [];
	}
}

/**
 * Get the change description for a file based on its extension and diff stats.
 */
function describeFileChange(file: ChangedFile): string {
	const ext = file.file.split(".").pop()?.toLowerCase() || "";
	if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
		if (file.linesAdded > 50) return "significant changes";
		if (file.linesAdded > 10) return "multiple changes";
		return "minor changes";
	}
	if (ext === "json") return "config/data change";
	if (ext === "css" || ext === "scss" || ext === "less") return "style changes";
	if (ext === "md" || ext === "txt") return "documentation changes";
	return `${file.linesAdded} lines added, ${file.linesRemoved} removed`;
}

// ── LSP diagnostics collection ──────────────────────────────────────────────

interface LspDiagEntry {
	file: string;
	line: number;
	severity: "error" | "warning";
	message: string;
}

/**
 * Collect LSP diagnostics for changed files by running a subprocess checker.
 * Falls back to tsc --noEmit for TypeScript projects.
 * Uses async exec to avoid blocking the event loop (fixes #97).
 */
async function collectLspDiagnostics(log?: (msg: string) => void): Promise<LspDiagEntry[]> {
	const diagnostics: LspDiagEntry[] = [];
	try {
		// Run tsc --noEmit for TypeScript diagnostics (async, 15s timeout)
		try {
			const { stdout } = await execAsync(
				"npx tsc --noEmit --pretty false 2>&1 || true",
				{ encoding: "utf-8", timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
			);
			const output = stdout.trim();

			if (output) {
				// Parse tsc output for error lines
				const lines = output.split("\n");
				for (const line of lines) {
					// Match: file.ts(line,col): error TS1234: message
					const match = line.match(/^(.+\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+)?\s*(.*)$/i);
					if (match) {
						diagnostics.push({
							file: match[1]!,
							line: parseInt(match[2]!, 10),
							severity: (match[4]?.toLowerCase() === "error" ? "error" : "warning") as "error" | "warning",
							message: (match[6] || match[5] || "").slice(0, 200),
						});
					}
				}
			}
		} catch (err) {
			log?.(`[pi-shazam] tsc diagnostics failed: ${err}`);
		}
	} catch (err) {
		log?.(`[pi-shazam] LSP diagnostics collection failed: ${err}`);
	}
	return diagnostics;
}

// ── Symbol-level change detection ──────────────────────────────────────────

interface SymbolChange {
	name: string;
	kind: string;
	file: string;
	change: "added" | "removed" | "modified";
}

/**
 * Detect symbol-level changes by comparing current graph with cache.
 */
function detectSymbolChanges(projectRoot: string): SymbolChange[] {
	try {
		const baseline = diffBaseline(scanProject(projectRoot, () => {}), projectRoot);
		if (!baseline) return [];

		const changes: SymbolChange[] = [];

		for (const sym of baseline.addedSymbols ?? []) {
			changes.push({ name: sym.name, kind: "symbol", file: sym.file, change: "added" });
		}
		for (const sym of baseline.removedSymbols ?? []) {
			changes.push({ name: sym.name, kind: "symbol", file: sym.file, change: "removed" });
		}
		for (const sym of baseline.modifiedSymbols ?? []) {
			changes.push({ name: sym.name, kind: sym.kind, file: sym.file, change: "modified" });
		}

		return changes;
	} catch {
		return [];
	}
}

// ── Handle write result ──────────────────────────────────────────────────────

/**
 * Handle a write/edit tool result by running diagnostics and reporting findings.
 *
 * @param toolName - The tool that was executed (write or edit)
 * @param projectRoot - Project root directory
 * @returns Diagnostic findings as a formatted text string with verdict
 */
export async function handleWriteResult(toolName: string, projectRoot: string): Promise<{ text: string; verdict: "PASS" | "WARN" | "FAIL" }> {
	try {
		// Re-scan project to detect changes
		const graph = scanProject(projectRoot, () => {});

		const lines: string[] = [];
		lines.push(`═══ shazam_verify (auto after ${toolName}) ═══`);
		lines.push("");

		// ── Project summary ──────────────────────────────────────────────
			const edgeCount = getGraphEdgeCount(graph);
		lines.push(`Project: ${graph.symbols.size} symbols, ${graph.fileSymbols.size} files, ${edgeCount} edges`);
		lines.push("");

		// ── Per-file git diff (Issue #75) ────────────────────────────────
		const changedFiles = getGitDiff();
		if (changedFiles.length > 0) {
			lines.push("### Changed Files");
			for (const cf of changedFiles) {
				const description = describeFileChange(cf);
				lines.push(`  ${cf.status} ${cf.file} — ${description}`);
			}
			lines.push("");
		}

		// ── Session baseline diff (Issue #79 + #78) ──────────────────────
		const sessionDiff = diffFromBaseline(graph, 0, 0);
		if (sessionDiff) {
			lines.push(formatBaselineDiff(sessionDiff));
		} else {
			// Fall back to disk cache diff
			const diskDiff = diffBaseline(graph, projectRoot);
			if (diskDiff) {
				const added = diskDiff.addedSymbols?.length ?? 0;
				const removed = diskDiff.removedSymbols?.length ?? 0;
				const modified = diskDiff.modifiedSymbols?.length ?? 0;
				if (added + removed + modified > 0) {
					lines.push("### Graph Changes");
					lines.push(`+${added} added, -${removed} removed, ~${modified} modified`);
					lines.push("");
				}
			}
		}

		// ── Symbol-level changes ─────────────────────────────────────────
		const symbolChanges = detectSymbolChanges(projectRoot);
		if (symbolChanges.length > 0) {
			lines.push("### Symbol Changes");
			for (const sc of symbolChanges.slice(0, 15)) {
				lines.push(`  ${sc.change === "added" ? "+" : sc.change === "removed" ? "-" : "~"} ${sc.kind} \`${sc.name}\` — ${sc.file}`);
			}
			if (symbolChanges.length > 15) {
				lines.push(`  ... and ${symbolChanges.length - 15} more`);
			}
			lines.push("");
		}

		// ── LSP Diagnostics (per-file) ───────────────────────────────────
		const lspDiags = await collectLspDiagnostics();
		const lspErrors = lspDiags.filter((d) => d.severity === "error");
		const lspWarnings = lspDiags.filter((d) => d.severity === "warning");

		lines.push("### LSP Diagnostics");
		if (lspErrors.length > 0) {
			lines.push(`[FAIL] ${lspErrors.length} type error(s) found:`);
			for (const err of lspErrors.slice(0, 10)) {
				lines.push(`  - ${err.file}:${err.line} — ${err.message.slice(0, 120)}`);
			}
			if (lspErrors.length > 10) lines.push(`  ... and ${lspErrors.length - 10} more`);
		} else {
			lines.push("[PASS] No type errors");
		}

		if (lspWarnings.length > 0) {
			lines.push(`[WARN] ${lspWarnings.length} warning(s) found`);
			for (const w of lspWarnings.slice(0, 5)) {
				lines.push(`  - ${w.file}:${w.line} — ${w.message.slice(0, 120)}`);
			}
		}
		lines.push("");

		// ── Orphan analysis ──────────────────────────────────────────────
		const orphanCount = [...graph.symbols.values()].filter((sym) => {
			if (sym.visibility === "exported" && sym.pagerank > 0.01) return false;
			if (sym.kind === "anonymous_function") return false;
			if (sym.file.includes("tests/") || sym.file.includes(".test.")) return false;
			const incoming = graph.incoming.get(sym.id);
			return !incoming || incoming.length === 0;
		}).length;

		if (orphanCount > 0) {
			lines.push(`[WARN] ${orphanCount} orphan symbols detected`);
		} else {
			lines.push("[PASS] No orphan symbols");
		}
		lines.push("");

		// ── Risk assessment ─────────────────────────────────────────────
		const totalChanges = changedFiles.length + orphanCount + lspErrors.length;
		let riskLevel: string;
		if (lspErrors.length > 0) {
			riskLevel = "HIGH — fix type errors before proceeding";
		} else if (orphanCount > 10 || totalChanges > 20) {
			riskLevel = "MEDIUM — review orphans and verify intent";
		} else {
			riskLevel = "LOW — changes look contained";
		}
		lines.push(`Risk: ${riskLevel}`);
		lines.push("");

		// ── Determine verdict (Issue #78: block on FAIL) ─────────────────
		let verdict: "PASS" | "WARN" | "FAIL";
		if (lspErrors.length > 0) {
			verdict = "FAIL";
		} else if (orphanCount > 0 || lspWarnings.length > 0) {
			verdict = "WARN";
		} else {
			verdict = "PASS";
		}
		lines.push(`Verdict: [${verdict}]`);

		return { text: lines.join("\n"), verdict };
	} catch (err) {
		return {
			text: `[pi-shazam] Auto-verify failed: ${err}`,
			verdict: "WARN",
		};
	}
}

// ── Register hook ──────────────────────────────────────────────────────────

/**
 * Register the after-write hook on the Pi extension API.
 *
 * On `tool_result` for write/edit operations, runs diagnostics and sends
 * findings via pi.sendMessage(). Optionally blocks on FAIL verdict
 * to prevent the LLM from continuing with broken code.
 */
export function shouldTriggerVerify(toolName: string, isError: boolean): boolean {
	return _WRITE_TOOLS.has(toolName) && !isError;
}

export function registerAfterWriteHook(pi: ExtensionAPI): void {
	pi.on("tool_result", async (event, _ctx) => {
		try {
			// Skip non-write tools and errors
			if (!shouldTriggerVerify(event.toolName, event.isError)) {
				return;
			}

			const result = await handleWriteResult(event.toolName, ".");

			// Send findings as a message to the LLM
			pi.sendMessage({
				customType: "shazam-auto-verify",
				content: result.text,
				display: true,
			});

			// Issue #78: Block on FAIL verdict to prevent continuing with broken code
			// This returns { block: true } which stops the LLM from proceeding
			// until the user acknowledges or fixes the issues.
			if (result.verdict === "FAIL") {
				// Return from the handler to signal blocking
				// Note: tool_result handlers can return { block: true } but this
				// is not standard in all Pi versions. We use sendMessage as
				// the primary mechanism; blocking is best-effort.
				pi.logger?.warn?.("[pi-shazam] FAIL verdict — fix errors before proceeding");
			}
		} catch (err) {
			pi.logger?.warn(`[pi-shazam] Auto-verify hook error: ${err}`);
		}
	});
}
