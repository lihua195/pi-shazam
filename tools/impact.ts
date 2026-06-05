/**
 * pi-shazam tools/impact — Change blast radius analysis.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerImpact(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_impact",
		label: "Change Impact Analysis",
		description: `\
MUST call before editing 2+ files or any shared/exported module.
Returns: exact list of files affected by planned changes, symbols at
risk, test files that need re-running. Also surfaces untested code
paths in the blast zone. Skipping this = guessing which tests to run
and which callers to update.

Scenario: refactoring. Adding a parameter to a shared function.
Changing a type definition. Before any PR that touches >1 file.

Pass --with-symbols for per-symbol risk breakdown. Pass --compact for
concise output (file names only). Supports multiple --files.`,
		parameters: pi.typebox.Object({
			files: pi.typebox.Array(pi.typebox.String()),
			withSymbols: pi.typebox.Optional(pi.typebox.Boolean()),
			compact: pi.typebox.Optional(pi.typebox.Boolean()),
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
							: `shazam_impact: not yet implemented (files: ${params.files.join(", ")})`,
					},
				],
			};
		},
	});
}
