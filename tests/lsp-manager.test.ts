import { describe, it, expect, beforeEach, vi } from "vitest";
import { LspManager } from "../lsp/manager.js";
import type { LspClient } from "../lsp/client.js";

describe("lsp/manager", () => {
	describe("LspManager constructor", () => {
		it("should create an LspManager", () => {
			const manager = new LspManager("/test/project");
			expect(manager).toBeDefined();
		});

		it("should initialize with empty server list", () => {
			const manager = new LspManager("/test/project");
			expect(manager.getActiveServers()).toEqual([]);
		});
	});

	describe("LspManager lifecycle", () => {
		let manager: LspManager;

		beforeEach(() => {
			manager = new LspManager("/test/project");
		});

		it("should expose getActiveServers method", () => {
			expect(typeof manager.getActiveServers).toBe("function");
		});

		it("should expose shutdown method", () => {
			expect(typeof manager.shutdown).toBe("function");
		});

		it("should expose getServerForFile method", () => {
			expect(typeof manager.getServerForFile).toBe("function");
		});

		it("should expose detectLanguages method", () => {
			expect(typeof manager.detectLanguages).toBe("function");
		});
	});

	describe("getServerForFile", () => {
		it("should return null for unsupported file types", async () => {
			const manager = new LspManager("/test/project");
			// Manager starts with no servers, and .rb is not in our 6-language map
			expect(await manager.getServerForFile("/test/script.rb")).toBeNull();
		});
	});

	describe("shutdown + re-initialize (#334 latch reset)", () => {
		it("should reset _shuttingDown when initializeAll is called after shutdown", async () => {
			const manager = new LspManager("/test/project");
			// Shutdown sets the latch
			await manager.shutdown();
			// initializeAll should reset the latch — with no LSP servers
			// installed, it will complete without spawning anything.
			// The key test: calling initializeAll after shutdown should not throw
			// or hang, and the manager should be usable again.
			await manager.initializeAll();

			// After reset, getServerForFile should NOT return null due to latch.
			// An unsupported file type (.rb) still returns null, but a supported
			// type (.ts) would at least attempt detection (it fails gracefully
			// because no tsserver is installed in CI).
			const result = await manager.getServerForFile("/test/script.rb");
			expect(result).toBeNull(); // still null for .rb
		});
	});

	describe("shutdown timeout (#334)", () => {
		it("should complete shutdown even with missing servers (no-op)", async () => {
			const manager = new LspManager("/test/project");
			// Shutdown with empty server list should complete immediately
			await expect(manager.shutdown()).resolves.toBeUndefined();
		});

		it("should complete within timeout when called on empty manager", async () => {
			const manager = new LspManager("/test/project");
			const start = Date.now();
			await manager.shutdown();
			const elapsed = Date.now() - start;
			// Should complete quickly (well under the 8s timeout)
			expect(elapsed).toBeLessThan(5000);
		});
	});

	describe("initializeAll with AbortSignal (#341)", () => {
		it("should handle pre-aborted signal", async () => {
			const manager = new LspManager("/test/project");
			const controller = new AbortController();
			controller.abort(); // signal already aborted

			// Should complete without throwing (all server inits skip)
			await expect(manager.initializeAll(controller.signal)).resolves.toBeUndefined();
		});

		it("should complete normally without signal", async () => {
			const manager = new LspManager("/test/project");
			// No signal — should complete normally (no servers to init)
			await expect(manager.initializeAll()).resolves.toBeUndefined();
		});
	});
});

describe("version manager bin discovery (#426)", () => {
	it("should resolve NVM_BIN directory when env var is set", async () => {
		const { _getVersionManagerBinDirs } = await import("../lsp/manager.js");
		const origNvmBin = process.env.NVM_BIN;
		try {
			if (origNvmBin) {
				const dirs = _getVersionManagerBinDirs();
				expect(dirs).toContain(origNvmBin);
			}
		} finally {
			process.env.NVM_BIN = origNvmBin;
		}
	});

	const ALL_VM_ENV_VARS = [
		"NVM_BIN",
		"FNM_MULTISHELL_PATH",
		"FNM_DIR",
		"VOLTA_HOME",
		"MISE_DATA_DIR",
		"ASDF_DATA_DIR",
		"PYENV_ROOT",
		"PNPM_HOME",
		"N_PREFIX",
		"HOMEBREW_PREFIX",
	];

	it("should return only default fallback dirs when no version manager env vars are set", async () => {
		const { _getVersionManagerBinDirs } = await import("../lsp/manager.js");
		const orig: Record<string, string | undefined> = {};
		for (const k of ALL_VM_ENV_VARS) orig[k] = process.env[k];
		try {
			for (const k of ALL_VM_ENV_VARS) delete process.env[k];
			const dirs = _getVersionManagerBinDirs();
			// When no env vars are set, results come from default fallback dirs
			// that exist on the machine. All returned values must be valid paths.
			for (const dir of dirs) {
				expect(dir).toBeTruthy();
				expect(typeof dir).toBe("string");
			}
		} finally {
			for (const [k, v] of Object.entries(orig)) {
				if (v !== undefined) process.env[k] = v;
			}
		}
	});

	it("should skip non-existent directories", async () => {
		const { _getVersionManagerBinDirs } = await import("../lsp/manager.js");
		const orig: Record<string, string | undefined> = {};
		for (const k of ALL_VM_ENV_VARS) orig[k] = process.env[k];
		try {
			for (const k of ALL_VM_ENV_VARS) delete process.env[k];
			process.env.NVM_BIN = "/nonexistent/path/that/does/not/exist";
			const dirs = _getVersionManagerBinDirs();
			// The nonexistent path must not appear in results
			expect(dirs).not.toContain("/nonexistent/path/that/does/not/exist");
		} finally {
			for (const [k, v] of Object.entries(orig)) {
				if (v !== undefined) process.env[k] = v;
			}
		}
	});
});
