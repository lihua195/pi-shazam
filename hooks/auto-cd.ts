/**
 * pi-shazam hooks/auto-cd — Auto-cd to project root for bash commands.
 *
 * Intercepts bash tool calls and prepends `cd <project-root> &&` to ensure
 * commands always run in the correct directory, even if the LLM is in a
 * different working directory.
 *
 * This solves the common issue where `gh issue list` fails because the
 * current directory is not a git repository.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";
import { resolve } from "node:path";

/**
 * Register the auto-cd hook.
 *
 * On tool_call for bash, prepends `cd <project-root> &&` to the command
 * if it's not already in the project root.
 */
export function registerAutoCd(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return;

		const input = event.input as Record<string, unknown>;
		if (typeof input.command !== "string") return;

		const command = input.command;

		// Skip if already cd'd or if it's a simple command
		if (command.startsWith("cd ") || command.startsWith("source ")) return;

		// Get project root from pi's cwd
		const projectRoot = resolve(process.cwd());

		// Prepend cd to project root
		input.command = `cd ${JSON.stringify(projectRoot)} && ${command}`;
	});
}
