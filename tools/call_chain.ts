/**
 * pi-shazam tools/call_chain — Call graph traversal.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerCallChain(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_call_chain",
		label: "Call Chain Analysis",
		description: `\
MUST call before changing a function signature, deleting code, or
refactoring. Traces ALL upstream callers and downstream callees for a
symbol. Without this, you cannot know the blast radius. Every caller
you miss is a bug you will ship.

Returns: incoming calls (who calls this), outgoing calls (what this
calls), and full reference list. Pass --depth to control traversal
depth (default 2).

Scenario: changing parameter order. Removing a function. Renaming an
exported symbol. Changing return type. Adding required parameters.`,
		parameters: pi.typebox.Object({
			symbol: pi.typebox.String(),
			depth: pi.typebox.Optional(pi.typebox.Number()),
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
							: `shazam_call_chain: not yet implemented (symbol: ${params.symbol})`,
					},
				],
			};
		},
	});
}
