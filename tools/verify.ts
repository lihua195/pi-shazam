/**
 * pi-shazam tools/verify — Post-edit diagnostics gate.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerVerify(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_verify",
		label: "Verify Changes",
		description: `\
MUST call after EVERY non-trivial edit or write. This is the evidence
gate — it runs git diff → risk assessment → LSP diagnostics
(pyright/tsc/rust-analyzer/gopls) → orphan symbol detection →
call-graph consistency check → contract risk analysis. All in one
pass.

If verify fails, your code has problems. Fix them BEFORE committing.
Use --quick for a 2s risk-only check after each edit. Use full verify
(no flag) before commit.

Scenario: after every edit. Before git commit. Before calling
goal_complete. When CI is red and you need local diagnostics.`,
		parameters: pi.typebox.Object({
			quick: pi.typebox.Optional(pi.typebox.Boolean()),
			json: pi.typebox.Optional(pi.typebox.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const json = params.json ?? false;
			const quick = params.quick ?? false;
			return {
				content: [
					{
						type: "text",
						text: json
							? JSON.stringify({ status: "not_implemented" })
							: `shazam_verify: not yet implemented${quick ? " (quick mode)" : ""}`,
					},
				],
			};
		},
	});
}
