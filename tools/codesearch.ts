/**
 * pi-shazam tools/codesearch — BM25 symbol search.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerCodesearch(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_codesearch",
		label: "Code Search (BM25)",
		description: `\
Call to search for symbols by keyword across the entire project using
BM25 relevance ranking with synonym expansion. Returns ranked results:
file:line, symbol name, kind, and snippet.

More semantic than grep — understands camelCase/snake_case tokenization
and ranks by PageRank-weighted relevance, not just substring match.

Scenario: finding error handling patterns. Locating all database query
functions. Searching for "auth" across a multi-language codebase.
Finding usage of a deprecated API before removing it.`,
		parameters: pi.typebox.Object({
			query: pi.typebox.String(),
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
							: `shazam_codesearch: not yet implemented (query: ${params.query})`,
					},
				],
			};
		},
	});
}
