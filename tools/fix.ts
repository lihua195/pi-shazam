/**
 * pi-shazam tools/fix — Auto-fix lint/format.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerFix(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_fix",
		label: "Auto-Fix Format & Lint",
		description: `\
Call after shazam_verify or shazam_check reports format/lint errors.
Runs nearest-wins auto-fixers (prettier, biome, ruff, cargo fmt,
gofmt, eslint --fix). Modifies format ONLY — never touches logic.

Always run with --dry-run first to preview changes before applying.
After fixing, re-run shazam_verify to confirm clean.

Scenario: trailing whitespace. Import sorting. Indentation mismatches.
Line length violations after an edit. Mixed tabs/spaces. Missing
newlines at end of file.`,
		parameters: pi.typebox.Object({
			dryRun: pi.typebox.Optional(pi.typebox.Boolean()),
			file: pi.typebox.Optional(pi.typebox.String()),
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
							: `shazam_fix: not yet implemented${params.dryRun ? " (dry run)" : ""}`,
					},
				],
			};
		},
	});
}
