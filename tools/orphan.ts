/**
 * pi-shazam tools/orphan — Dead code detection.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerOrphan(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_orphan",
		label: "Dead Code Detection",
		description: `\
Call to find dead code: symbols with zero incoming references across
the entire project. Confidence ≥ 70 means LIKELY safe to delete.
Confidence < 70 means check for dynamic references (string dispatch,
reflection, macros, event listeners, test-only usage).

MUST call shazam_refs on each candidate before actual deletion to
confirm zero references. A "dead" function that's called via
getattr/dlsym/Reflect is still live — orphan detection cannot see
dynamic dispatch.

Scenario: cleaning up unused code. Finding abandoned modules. Before a
major refactor to identify removable surface area. After removing a
feature to find orphaned helpers.`,
		parameters: pi.typebox.Object({
			file: pi.typebox.Optional(pi.typebox.String()),
			minConfidence: pi.typebox.Optional(pi.typebox.Number()),
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
							: "shazam_orphan: not yet implemented",
					},
				],
			};
		},
	});
}
