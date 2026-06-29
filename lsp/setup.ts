/**
 * pi-shazam lsp/setup -- /shazam-setup command: detect + install guidance.
 *
 * Scans the project for supported languages, detects installed LSP servers,
 * and outputs install instructions for missing ones.
 *
 * Ported from repomap/src/lsp.py (detect_lsp_servers and CLI output formatting).
 */

import { homedir } from "node:os";
import { detectLspServer, detectProjectLanguages } from "./manager.js";
import type { LspServerDetection } from "./manager.js";

// -- Install instructions -----------------------------------------------------

interface InstallInstruction {
	language: string;
	serverName: string;
	packages: string[];
	commands: string[];
}

const INSTALL_INSTRUCTIONS: InstallInstruction[] = [
	{
		language: "python",
		serverName: "pyright-langserver",
		packages: ["pyright"],
		commands: ["npm install -g pyright", "pip install pyright"],
	},
	{
		language: "python",
		serverName: "pylsp",
		packages: ["python-lsp-server"],
		commands: ["pip install python-lsp-server", "pipx install python-lsp-server"],
	},
	{
		language: "typescript",
		serverName: "typescript-language-server",
		packages: ["typescript-language-server", "typescript"],
		commands: ["npm install -g typescript-language-server typescript"],
	},
	{
		language: "go",
		serverName: "gopls",
		packages: ["golang.org/x/tools/gopls"],
		commands: ["go install golang.org/x/tools/gopls@latest"],
	},
	{
		language: "json",
		// #457: keep serverName in sync with lsp/servers.ts so the install
		// hint is routed to the correct entry in INSTALL_INSTRUCTIONS.
		serverName: "vscode-json-language-server",
		packages: ["vscode-langservers-extracted"],
		commands: ["npm install -g vscode-langservers-extracted"],
	},
	{
		language: "yaml",
		serverName: "yaml-language-server",
		packages: ["yaml-language-server"],
		commands: ["npm install -g yaml-language-server"],
	},
	{
		language: "rust",
		serverName: "rust-analyzer",
		packages: ["rust-analyzer"],
		commands: ["rustup component add rust-analyzer", "brew install rust-analyzer"],
	},
	{
		language: "dart",
		serverName: "dart",
		packages: ["dart-sdk"],
		commands: ["Install Dart SDK from https://dart.dev/get-dart", "brew install dart-sdk"],
	},
];

/**
 * Exported for tests only. Do not import from production code.
 * Production code should go through `generateSetupReport` or `getInstallInstructions`.
 */
export const INSTALL_INSTRUCTIONS_INTERNAL: readonly InstallInstruction[] = INSTALL_INSTRUCTIONS;

// -- Re-export for convenience ------------------------------------------------

export type { LspServerDetection };

// -- Detection ----------------------------------------------------------------

/**
 * Detect LSP servers for specified languages or auto-detect from project.
 */
export function detectLspServers(projectRoot: string, languages?: string[]): LspServerDetection[] {
	const detected = languages ?? detectProjectLanguages(projectRoot);
	return detected.map((lang) => detectLspServer(projectRoot, lang));
}

// -- Setup command handler ----------------------------------------------------

/**
 * Generate the /shazam-setup output as a formatted string.
 */
export function generateSetupReport(projectRoot: string, languages?: string[]): string {
	const detections = detectLspServers(projectRoot, languages);
	const available: LspServerDetection[] = [];
	const missing: LspServerDetection[] = [];

	for (const d of detections) {
		if (d.status === "available") {
			available.push(d);
		} else {
			missing.push(d);
		}
	}

	const lines: string[] = [];

	lines.push("## Shazam LSP Setup");
	lines.push("");
	lines.push(`Project: ${projectRoot.startsWith(homedir()) ? "~" + projectRoot.slice(homedir().length) : projectRoot}`);
	lines.push(`Detected languages: ${detections.map((d) => d.language).join(", ") || "none"}`);
	lines.push("");

	// Available servers
	if (available.length > 0) {
		lines.push("### [PASS] Available LSP Servers");
		lines.push("");
		for (const d of available) {
			lines.push(`- **${d.language}**: \`${d.serverName}\` (${d.source}: \`${d.command.join(" ")}\`)`);
		}
		lines.push("");
	}

	// Missing servers with install instructions
	if (missing.length > 0) {
		lines.push("### [FAIL] Missing LSP Servers");
		lines.push("");
		for (const d of missing) {
			const instruction = INSTALL_INSTRUCTIONS.find((i) => i.language === d.language && i.serverName === d.serverName);

			lines.push(`#### ${d.language} - ${d.serverName}`);
			if (d.reason) {
				lines.push(`  Reason: ${d.reason}`);
			}
			if (instruction) {
				lines.push("  Install:");
				for (const cmd of instruction.commands) {
					lines.push(`    ${cmd}`);
				}
			}
			lines.push("");
		}
	}

	if (detections.length === 0) {
		lines.push("No supported languages detected in this project. LSP features will be unavailable.");
	}

	return lines.join("\n");
}

/**
 * Generate a brief one-line summary for UI notifications and status bar.
 * Returns both a compact notification string and status bar text.
 */
export function generateSetupSummary(
	projectRoot: string,
	languages?: string[],
): {
	notifyMessage: string;
	notifyType: "info" | "warning" | "error";
	statusText: string;
	allPass: boolean;
	availableLangs: string[];
	missingLangs: string[];
} {
	const detections = detectLspServers(projectRoot, languages);
	const available = detections.filter((d) => d.status === "available");
	const missing = detections.filter((d) => d.status === "missing");
	const availableLangs = available.map((d) => d.language);
	const missingLangs = missing.map((d) => d.language);

	if (detections.length === 0) {
		return {
			notifyMessage: "pi-shazam: 未检测到支持的语言，LSP 功能不可用",
			notifyType: "warning",
			statusText: "LSP: 无",
			allPass: false,
			availableLangs: [],
			missingLangs: [],
		};
	}

	if (missing.length === 0) {
		// All servers available
		const langList = availableLangs.map((l) => `${l} ✓`).join(", ");
		return {
			notifyMessage: `pi-shazam: LSP 就绪 — ${langList}`,
			notifyType: "info",
			statusText: `LSP: ${langList}`,
			allPass: true,
			availableLangs,
			missingLangs: [],
		};
	}

	if (available.length === 0) {
		// All missing
		const langList = missingLangs.join(", ");
		return {
			notifyMessage: `pi-shazam: LSP 服务器缺失 — ${langList}，运行 /shazam-setup 查看安装指引`,
			notifyType: "warning",
			statusText: `LSP: ${langList} ✗`,
			allPass: false,
			availableLangs: [],
			missingLangs,
		};
	}

	// Mixed: some available, some missing
	const passList = availableLangs.map((l) => `${l} ✓`).join(", ");
	const failList = missingLangs.map((l) => `${l} ✗`).join(", ");
	return {
		notifyMessage: `pi-shazam: LSP — ${passList}，缺失 ${failList}，运行 /shazam-setup 查看详情`,
		notifyType: "warning",
		statusText: `LSP: ${passList}，${failList}`,
		allPass: false,
		availableLangs,
		missingLangs,
	};
}

/**
 * Get the install instructions as a simple key-value map
 * for use in tool outputs.
 */
export function getInstallInstructions(): Record<string, string[]> {
	const map: Record<string, string[]> = {};
	for (const inst of INSTALL_INSTRUCTIONS) {
		const key = `${inst.language}:${inst.serverName}`;
		map[key] = inst.commands;
	}
	return map;
}
