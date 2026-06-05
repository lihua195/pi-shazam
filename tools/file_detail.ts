/**
 * pi-shazam tools/file_detail — Single file deep analysis.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerFileDetail(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_file_detail",
		label: "File Deep Analysis",
		description: `\
Call to get a complete structural breakdown of a single file: all
symbols (functions, classes, types, constants) with signatures,
visibility, line ranges, incoming call count, and PageRank score.
Also returns LSP symbol tree when available.

MUST call before making edits to an unfamiliar file — reading the raw
file shows you syntax, this shows you STRUCTURE. You will spot
dependencies and side effects that raw reading misses.

Scenario: before editing a file for the first time. Before refactoring
a large file. When deciding where to add a new function (PageRank shows
you the file's "gravity"). After someone else's PR to understand what
changed structurally.`,
		parameters: pi.typebox.Object({
			file: pi.typebox.String(),
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
							: `shazam_file_detail: not yet implemented (file: ${params.file})`,
					},
				],
			};
		},
	});
}
