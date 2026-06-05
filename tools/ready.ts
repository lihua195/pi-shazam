/**
 * pi-shazam tools/ready — Pre-commit readiness check.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerReady(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_ready",
		label: "Pre-Commit Readiness",
		description: `\
MUST call before committing, pushing, or calling goal_complete. Runs
verify + check + fix in sequence. This is the FINAL GATE — the last
thing you do before shipping code. If ready fails, you are NOT DONE.
Fix all issues and call ready again until it passes with zero errors.

Scenario: about to git commit. About to push. About to open a PR.
About to call goal_complete. Before merging to main.`,
		parameters: pi.typebox.Object({
			json: pi.typebox.Optional(pi.typebox.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const json = params.json ?? false;
			return {
				content: [
					{
						type: "text",
						text: json
							? JSON.stringify({ status: "not_implemented" })
							: "shazam_ready: not yet implemented",
					},
				],
			};
		},
	});
}
