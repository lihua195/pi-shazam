/**
 * pi-shazam tools/refs — Reference finder.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerRefs(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_refs",
		label: "Find References",
		description: `\
Call to find EVERY reference to a symbol (function, class, variable,
type) across the entire project. Uses LSP references + tree-sitter
fallback. Returns file:line:context for each usage.

MUST call BEFORE renaming, deleting, or changing visibility of any
symbol. A reference you miss is a broken import or a runtime crash.

Scenario: renaming a variable. Changing a function from public to
private. Deleting dead code (confirm zero references first). Checking
if a deprecated function still has callers.`,
		parameters: pi.typebox.Object({
			symbol: pi.typebox.String(),
			file: pi.typebox.Optional(pi.typebox.String()),
			line: pi.typebox.Optional(pi.typebox.Number()),
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
							: `shazam_refs: not yet implemented (symbol: ${params.symbol})`,
					},
				],
			};
		},
	});
}
