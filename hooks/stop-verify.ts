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
 */

import type { ExtensionAPI } from "../types/pi-extension.js";
import { getEditedFiles } from "./pre-edit.js";

/**
 * Check if shazam_verify was called recently by reading the audit log.
 */
function hasRecentVerify(): boolean {
	try {
		const { readFileSync, statSync } = require("node:fs");
		const { join } = require("node:path");
		const { homedir } = require("node:os");

		const logFile = join(homedir(), ".pi", "hooks", "audit", "shazam-calls.log");

		// Check if log file exists and was modified recently (within 3 minutes)
		try {
			const stat = statSync(logFile);
			const threeMinutesAgo = Date.now() - 3 * 60 * 1000;
			if (stat.mtimeMs < threeMinutesAgo) {
				return false;
			}
		} catch {
			return false;
		}

		// Read last 10 lines to check for recent shazam_verify calls
		const content = readFileSync(logFile, "utf-8");
		const lines = content.trim().split("\n").slice(-10);

		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				if (entry.tool === "shazam_verify" && entry.event === "result") {
					return true;
				}
			} catch {
				// Skip malformed lines
			}
		}
	} catch {
		// If we can't check, assume verify was not run
	}

	return false;
}

/**
 * Register the stop-verify hook.
 *
 * On turn_end, checks if there were file edits that haven't been verified.
 * If so, sends a reminder to run shazam_verify.
 */
export function registerStopVerify(pi: ExtensionAPI): void {
	pi.on("turn_end", (_event, _ctx) => {
		// Check if there were file edits this session
		const editedFiles = getEditedFiles();
		if (editedFiles.length === 0) return;

		// Check if shazam_verify was run recently
		if (hasRecentVerify()) return;

		// Send reminder via sendMessage (injected into next turn context)
		// Using sendMessage instead of notify so the LLM sees it and can act
		const fileList = editedFiles.length <= 3
			? editedFiles.map(f => `\`${f}\``).join(", ")
			: `${editedFiles.length} files`;

		pi.sendMessage({
			customType: "shazam-reminder",
			content: [
				"[shazam] Verification reminder",
				"",
				`You edited ${fileList} this session but haven't run \`shazam_verify\`.`,
				"Run it now to check for type errors, lint issues, and broken references.",
			].join("\n"),
			display: false, // Don't show in UI, just inject into context
		});
	});
}
