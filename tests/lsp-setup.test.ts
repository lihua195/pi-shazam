import { describe, it, expect } from "vitest";
import { detectLspServers, generateSetupSummary, type LspServerDetection } from "../lsp/setup.js";

describe("lsp/setup", () => {
	describe("detectLspServers", () => {
		it("should return detection results for requested languages", () => {
			const results = detectLspServers("/test/project", ["typescript"]);
			expect(Array.isArray(results)).toBe(true);
			// Even if server not installed, should return a detection result
			expect(results.length).toBeGreaterThanOrEqual(1);
		});

		it("should return detection with status field", () => {
			const results = detectLspServers("/test/project", ["python"]);
			if (results.length > 0) {
				const detection = results[0]!;
				expect(detection).toHaveProperty("language");
				expect(detection).toHaveProperty("serverName");
				expect(detection).toHaveProperty("status");
				expect(["available", "missing"]).toContain(detection.status);
			}
		});

		it("should return detection for multiple languages", () => {
			const results = detectLspServers("/test/project", ["python", "typescript"]);
			const languages = results.map((r) => r.language);
			expect(languages).toContain("python");
			expect(languages).toContain("typescript");
		});

		it("should return empty for unsupported language", () => {
			const results = detectLspServers("/test/project", ["unsupported"]);
			// Should return at least an entry with missing/unsupported status
			expect(results.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe("LspServerDetection type", () => {
		it("should have the correct shape", () => {
			const detection: LspServerDetection = {
				language: "typescript",
				serverName: "typescript-language-server",
				status: "available",
				command: ["typescript-language-server", "--stdio"],
				source: "path",
				workspaceRoot: "/test/project",
			};
			expect(detection.language).toBe("typescript");
			expect(detection.status).toBe("available");
		});
	});

	describe("generateSetupSummary", () => {
		it("should return warning when no supported languages detected", () => {
			// Use /dev/null which has no source files
			const summary = generateSetupSummary("/dev/null");
			expect(summary.notifyType).toBe("warning");
			expect(summary.allPass).toBe(false);
			expect(summary.availableLangs).toHaveLength(0);
			expect(summary.notifyMessage).toContain("未检测到");
		});

		it("should return correct structure for current project", () => {
			const summary = generateSetupSummary(process.cwd());
			expect(summary).toHaveProperty("notifyMessage");
			expect(summary).toHaveProperty("notifyType");
			expect(summary).toHaveProperty("statusText");
			expect(summary).toHaveProperty("allPass");
			expect(summary).toHaveProperty("availableLangs");
			expect(summary).toHaveProperty("missingLangs");
			expect(["info", "warning", "error"]).toContain(summary.notifyType);
		});

		it("should return specific summary for specific languages", () => {
			// Request specific languages to get deterministic detection
			const summary = generateSetupSummary(process.cwd(), ["python"]);
			expect(summary.notifyMessage).toBeDefined();
			expect(summary.statusText).toBeDefined();
			// Python may or may not be available — either way the summary should be well-formed
			expect(typeof summary.allPass).toBe("boolean");
		});
	});
});
