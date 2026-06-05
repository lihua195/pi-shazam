/**
 * pi-shazam tools/routes — HTTP route inventory.
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerRoutes(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "shazam_routes",
		label: "HTTP Route Inventory",
		description: `\
Call when working on web/API projects to inventory ALL HTTP routes.
Returns: method (GET/POST/PUT/DELETE), path pattern, handler file:line.

MUST call before changing any route path or handler signature — a route
consumer you miss is a broken API endpoint in production. Also surfaces
routes WITHOUT authentication guards (security risk).

Scenario: adding a new API endpoint. Changing a route path or parameter
pattern. Refactoring middleware. Auditing auth coverage across
endpoints. Before deleting a handler function.`,
		parameters: pi.typebox.Object({
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
							: "shazam_routes: not yet implemented",
					},
				],
			};
		},
	});
}
