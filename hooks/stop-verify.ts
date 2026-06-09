/**
 * pi-shazam hooks/stop-verify — Remind to verify before ending turn.
 *
 * When the LLM tries to end its turn after making edits, this hook checks
 * if shazam_verify was run. If not, it sends a reminder message.
 *
 * This prevents the common pattern where LLM edits files and forgets
 * to check for errors before declaring "done".
 *
 * Uses turn_end event to detect when the agent is about to finish.
 * Tracks verify calls in memory for reliable detection.
 */

import type { ExtensionAPI } from "../types/pi-extension.js";
import { getEditedFiles } from "./pre-edit.js";

/**
 * Track whether shazam_verify was called in this session.
 * More reliable than checking audit log file.
 */
let _verifyCalledInSession = false;
let _lastVerifyTimestamp = 0;

/**
 * Mark that shazam_verify was called.
 */
function markVerifyCalled(): void {
	_verifyCalledInSession = true;
	_lastVerifyTimestamp = Date.now();
}

/**
 * Check if shazam_verify was called recently (within 5 minutes).
 */
function hasRecentVerify(): boolean {
	if (!_verifyCalledInSession) return false;

	// Also check if it was recent (within 5 minutes)
	const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
	return _lastVerifyTimestamp > fiveMinutesAgo;
}

/**
 * Register the stop-verify hook.
 *
 * On tool_result for shazam_verify, marks verify as called.
 * On turn_end, checks if there were file edits that haven't been verified.
 */
export function registerStopVerify(pi: ExtensionAPI): void {
	// Track shazam_verify calls
	pi.on("tool_result", (event) => {
		if (event.toolName === "shazam_verify" && !event.isError) {
			markVerifyCalled();
		}
	});

	// Reset on session start
	pi.on("session_start", () => {
		_verifyCalledInSession = false;
		_lastVerifyTimestamp = 0;
	});

	// Check on turn end
	pi.on("turn_end", (_event, _ctx) => {
		// Check if there were file edits this session
		const editedFiles = getEditedFiles();
		if (editedFiles.length === 0) return;

		// Check if shazam_verify was run recently
		if (hasRecentVerify()) return;

		// Send reminder via sendMessage (injected into next turn context)
		const fileList =
			editedFiles.length <= 3 ? editedFiles.map((f) => `\`${f}\``).join(", ") : `${editedFiles.length} files`;

		pi.sendMessage({
			customType: "shazam-reminder",
			content: [
				"[shazam] Verification reminder",
				"",
				`You edited ${fileList} this session but haven't run \`shazam_verify\`.`,
				"Run it now to check for type errors, lint issues, and broken references.",
			].join("\n"),
			display: false,
		});
	});
}
