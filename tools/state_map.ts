/**
 * pi-shazam tools/state_map — State definition discovery.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerStateMap(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_state_map",
		label: "State Map / Enum Explorer",
		description: `\
Call on enum, const group, or state-machine symbols to see EVERY
possible value and exactly where each value is used (pattern-matched
across the full project).

MUST call before adding/removing enum variants or changing state
transitions — a missing case in a switch/match is a runtime crash.
Returns: all variant names, count of usages per variant, and files
that would be impacted by variant changes.

Scenario: adding a new enum variant. Removing a state-machine state.
Auditing exhaustive match/switch coverage. Before changing a union
type's members.`,
		parameters: pi.typebox.Object({
			symbol: pi.typebox.String(),
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
							: `shazam_state_map: not yet implemented (symbol: ${params.symbol})`,
					},
				],
			};
		},
	});
}
