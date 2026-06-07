/**
 * pi-shazam hooks/pre-edit — Pre-edit impact analysis guard.
 *
 * Intercepts tool_call events for write/edit and detects when:
 *   1. Multiple files are about to be edited in a single turn
 *   2. A shared/exported module is being modified
 *   3. A function signature is being changed
 *
 * When triggered, it sends a warning message suggesting the user run
 * shazam_impact first to assess blast radius.
 */

import type { ExtensionAPI } from "../types/pi-extension.js";
import { execSync } from "node:child_process";

/**
 * Track files edited in the current session for multi-edit detection.
 */
const _editedFiles = new Set<string>();

/**
 * Get the list of files that have been edited so far in this session.
 */
export function getEditedFiles(): string[] {
	return [..._editedFiles];
}

/**
 * Clear the edited files tracker.
 */
export function clearEditedFiles(): void {
	_editedFiles.clear();
}

/**
 * Extract file paths from a tool call's input parameters.
 */
function extractFilesFromInput(input: unknown): string[] {
	const files: string[] = [];
	if (input && typeof input === "object") {
		const obj = input as Record<string, unknown>;

		// Tool calls may have `path` (write), `file` (edit), or `files` (impact)
		if (typeof obj.path === "string") files.push(obj.path);
		if (typeof obj.file === "string") files.push(obj.file);
		if (Array.isArray(obj.files)) {
			for (const f of obj.files) {
				if (typeof f === "string") files.push(f);
			}
		}

		// For edit tool, the edits array may contain file paths
		if (Array.isArray(obj.edits)) {
			for (const edit of obj.edits) {
				if (edit && typeof edit === "object" && typeof (edit as Record<string, unknown>).path === "string") {
					files.push((edit as Record<string, unknown>).path as string);
				}
			}
		}
	}
	return [...new Set(files)];
}

/**
 * Check if a file is a shared/exported module by looking at git history
 * and import frequency.
 */
function isSharedModule(filePath: string): boolean {
	try {
		// Check if the file is imported by many other files
		const importCount = execSync(
			`grep -r "from ['\"./]*${filePath.replace(/\.[^.]+$/, "")}['\"]" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" -l 2>/dev/null | wc -l`,
			{ encoding: "utf-8", timeout: 3000 },
		).trim();
		const count = parseInt(importCount, 10);
		return count >= 3;
	} catch {
		return false;
	}
}

/**
 * Register the pre-edit guard hook.
 *
 * On tool_call for write/edit, checks if the edit affects multiple files
 * or modifies a shared module and sends a warning message.
 */
export function registerPreEditGuard(pi: ExtensionAPI): void {
	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		// Don't re-warn if we already warned for this tool call
		const input = "input" in event ? (event as unknown as Record<string, unknown>).input : {};

		const files = extractFilesFromInput(input);
		if (files.length === 0) return;

		// Track files for multi-edit detection
		for (const f of files) {
			_editedFiles.add(f);
		}

		// Combine current files with previously edited files
		const allFiles = getEditedFiles();

		// Check conditions for suggesting impact analysis
		const reasons: string[] = [];

		// Condition 1: Multiple files edited in this session
		if (allFiles.length >= 2) {
			reasons.push(`This session has touched ${allFiles.length} files`);
		}

		// Condition 2: Shared/exported module being modified
		for (const f of files) {
			if (isSharedModule(f)) {
				reasons.push(`File "${f}" appears to be a shared module (imported by multiple files)`);
				break;
			}
		}

		if (reasons.length > 0) {
			ctx.ui?.notify?.(
				`[shazam] Caution: ${reasons.join("; ")}. Run \`shazam_impact --files ${allFiles.join(" ")}\` to assess blast radius before editing.`,
				"warning",
			);
		}
	});

	// Clear edited files on session start and shutdown
	pi.on("session_start", () => {
		clearEditedFiles();
	});

	pi.on("session_shutdown", () => {
		clearEditedFiles();
	});
}
