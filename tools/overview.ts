/**
 * pi-shazam tools/overview — Project structure summary.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerOverview(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_overview",
		label: "Project Overview",
		description: `\
MUST call before touching ANY code in an unfamiliar project or repo.
Returns: module dependency map, top-10 highest-PageRank files (the
"spine" of the codebase), entry points, and suggested reading order.
Skipping this = navigating blind — you WILL miss cross-module ripple
effects and waste turns on dead-end reads.

Scenario: first turn in a new repo. After git clone. After switching
to an unfamiliar project directory.

Output: plain text summary by default. Pass { json: true } for
structured output with file lists and PageRank scores.`,
		parameters: pi.typebox.Object({
			json: pi.typebox.Optional(pi.typebox.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const json = params.json ?? false;
			// TODO: implement via core/treesitter + core/pagerank
			return {
				content: [
					{
						type: "text",
						text: json
							? JSON.stringify({ status: "not_implemented" })
							: "shazam_overview: not yet implemented",
					},
				],
			};
		},
	});
}
