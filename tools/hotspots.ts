/**
 * pi-shazam tools/hotspots — Complexity hotspot ranking.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerHotspots(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_hotspots",
		label: "Complexity Hotspots",
		description: `\
Call to find complexity hotspots: files ranked by (symbol density ×
PageRank score). The top 5 results are the files where bugs are most
expensive — these files have the highest incoming dependency weight,
meaning changes here cascade into the largest blast radius.

Use this to decide where to focus code review, where to write tests
first, and which files a new developer should read to understand the
project's core.

Scenario: code review prioritization. Deciding which tests to write
next. Understanding where a new team member should start reading.
Triaging bug reports (is the affected file a hotspot?).`,
		parameters: pi.typebox.Object({
			topN: pi.typebox.Optional(pi.typebox.Number()),
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
							: "shazam_hotspots: not yet implemented",
					},
				],
			};
		},
	});
}
