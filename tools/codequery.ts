/**
 * pi-shazam tools/codequery — Unified symbol/file query.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerCodequery(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_codequery",
		label: "Symbol & File Query",
		description: `\
MUST call to locate a symbol or inspect a file BEFORE reading or
editing it. Uses LSP precision + tree-sitter parsing. Faster and more
accurate than grep/read — returns definition site, references, callers,
and type info in one call.

Supports: --symbol <name> (find definition + references), --file <path>
(list all symbols in file with signatures), --query <keyword> (BM25
search with synonym expansion).

If this returns empty or "not found", the symbol does not exist — do
not guess or invent it. Use --file to verify the file's actual contents.

Scenario: before editing any function/class. Before renaming. Before
deleting. When you need to find where something is defined. When grep
returns too many results.`,
		parameters: pi.typebox.Object({
			symbol: pi.typebox.Optional(pi.typebox.String()),
			file: pi.typebox.Optional(pi.typebox.String()),
			query: pi.typebox.Optional(pi.typebox.String()),
			json: pi.typebox.Optional(pi.typebox.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const json = params.json ?? false;
			const target = params.symbol ?? params.file ?? params.query ?? "?";
			return {
				content: [
					{
						type: "text",
						text: json
							? JSON.stringify({ status: "not_implemented" })
							: `shazam_codequery: not yet implemented (target: ${target})`,
					},
				],
			};
		},
	});
}
