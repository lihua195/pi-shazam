/**
 * pi-shazam hooks/failure-recovery — Detect consecutive failures and suggest alternatives.
 *
 * When the LLM repeatedly fails at the same task, this hook:
 * 1. Tracks failure patterns per tool
 * 2. After 3 consecutive failures, suggests a different approach
 * 3. After 5 consecutive failures, strongly suggests reorienting with shazam_overview
 *
 * This prevents LLM loops where it keeps trying the same failing approach.
 *
 * Uses tool_result event with isError flag.
 */

import type { ExtensionAPI } from "../types/pi-extension.js";

/**
 * Failure tracker: tool name -> consecutive failure count.
 */
const _failureCounts = new Map<string, number>();

/**
 * Track which tools have been warned about (to avoid repeated warnings).
 */
const _warnedTools = new Set<string>();

/**
 * Reset failure count for a tool (called on success).
 */
function resetFailure(toolName: string): void {
	_failureCounts.delete(toolName);
	_warnedTools.delete(toolName);
}

/**
 * Increment failure count and return new count.
 */
function incrementFailure(toolName: string): number {
	const current = _failureCounts.get(toolName) || 0;
	const newCount = current + 1;
	_failureCounts.set(toolName, newCount);
	return newCount;
}

/**
 * Get suggestion based on failure count and tool type.
 */
function getSuggestion(toolName: string, failCount: number): string | null {
	// After 5 failures: strong intervention
	if (failCount >= 5) {
		return [
			"[shazam] You've been stuck for a while.",
			"",
			"Consider:",
			"1. Run `shazam_overview` to reorient yourself",
			"2. Simplify the current task",
			"3. Ask the user for clarification",
		].join("\n");
	}

	// After 3 failures: suggest alternatives
	if (failCount >= 3 && !_warnedTools.has(toolName)) {
		_warnedTools.add(toolName);

		switch (toolName) {
			case "bash":
				return [
					"[shazam] Bash command failed 3x consecutively.",
					"",
					"Try a different approach:",
					"- Use `shazam_codesearch` instead of grep/find",
					"- Use `shazam_file_detail` to understand file structure first",
					"- Break the command into smaller steps",
				].join("\n");

			case "edit":
				return [
					"[shazam] Edit failed 3x consecutively.",
					"",
					"Try:",
					"- Use `shazam_file_detail` to see the current file structure",
					"- Use `shazam_symbol` to understand the symbol you're editing",
					"- Read the file first with `read` to see current content",
				].join("\n");

			case "write":
				return [
					"[shazam] Write failed 3x consecutively.",
					"",
					"Try:",
					"- Check if the directory exists",
					"- Use `shazam_impact` to check if the file is referenced elsewhere",
				].join("\n");

			default:
				return [
					`[shazam] ${toolName} failed 3x consecutively.`,
					"",
					"Consider running `shazam_overview` to reorient.",
				].join("\n");
		}
	}

	return null;
}

/**
 * Register the failure-recovery hook.
 *
 * On tool_result with isError, tracks failures and suggests alternatives
 * after repeated failures.
 */
export function registerFailureRecovery(pi: ExtensionAPI): void {
	pi.on("tool_result", (event, _ctx) => {
		const toolName = event.toolName;

		if (event.isError) {
			// Track failure
			const failCount = incrementFailure(toolName);
			const suggestion = getSuggestion(toolName, failCount);

			if (suggestion) {
				pi.sendMessage({
					customType: "shazam-failure-recovery",
					content: suggestion,
					display: false, // Inject into context, not UI
				});
			}
		} else {
			// Success — reset failure count
			resetFailure(toolName);
		}
	});

	// Reset all counts on session start
	pi.on("session_start", () => {
		_failureCounts.clear();
		_warnedTools.clear();
	});
}
