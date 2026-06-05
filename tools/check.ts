/**
 * pi-shazam tools/check — Compiler/lint diagnostics.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerCheck(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_check",
		label: "Compiler & Lint Diagnostics",
		description: `\
Call when shazam_verify reports errors or you need compiler/linter
diagnostics independent of git state. Runs tsc/eslint/pyright/go-vet/
rustc directly and returns file:line:code:message for every issue.

Fix ALL errors before proceeding — a red check means broken code, not
"warnings to ignore later." Unlike verify, check does NOT depend on git
diff state — it runs on the entire project.

Scenario: CI failed, need local reproduction. verify says "run check
for details." Mid-refactor before all files are saved. After npm install
to confirm no type regressions.`,
		parameters: pi.typebox.Object({
			file: pi.typebox.Optional(pi.typebox.String()),
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
							: "shazam_check: not yet implemented",
					},
				],
			};
		},
	});
}
