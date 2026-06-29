/**
 * Tests for hooks/stop-verify -- turn-end verify reminder (#467 Finding 4).
 *
 * Bug: when shazam_verify returned isError=true, the tool_result handler
 * skipped markVerifyCalled (guarded by `if (!event.isError)`), so
 * _reminderSent stayed true from the previous reminder. Every subsequent
 * turn_end then short-circuited at `wasReminderSent()`, so the agent was
 * never re-reminded to retry verify -- the reminder was "stuck" off.
 *
 * Fix: on a verify error, reset _reminderSent so a future turn_end can
 * fire a fresh reminder.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtensionAPI, ToolCallEvent, ToolResultEvent, ExtensionContext } from "../types/pi-extension.js";

// Stub pre-edit so stop-verify sees a non-empty edited-files list without
// having to register the full pre-edit hook.
vi.mock("../hooks/pre-edit.js", () => ({
	getEditedFiles: vi.fn(() => ["/proj/foo.ts"]),
	clearEditedFiles: vi.fn(),
}));

import { registerStopVerify } from "../hooks/stop-verify.js";
import { resetVerifyState, wasReminderSent } from "../hooks/verify-state.js";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

function createMockPi() {
	const handlers = new Map<string, Handler[]>();
	const sentMessages: unknown[] = [];
	const pi = {
		on(event: string, h: Handler) {
			if (!handlers.has(event)) handlers.set(event, []);
			handlers.get(event)!.push(h);
		},
		sendMessage: vi.fn((msg: unknown) => {
			sentMessages.push(msg);
		}),
	} as unknown as ExtensionAPI;

	function emit(event: string, data: unknown): unknown[] {
		const fns = handlers.get(event) || [];
		return fns.map((fn) => fn(data, createMockCtx()));
	}

	return { pi, handlers, emit, sentMessages };
}

function createMockCtx(): ExtensionContext {
	return {
		ui: { notify: vi.fn(), confirm: vi.fn(), select: vi.fn(), setStatus: vi.fn() },
		cwd: "/proj",
	} as unknown as ExtensionContext;
}

function makeVerifyResult(isError: boolean, text: string): ToolResultEvent {
	return {
		type: "tool_result",
		toolCallId: "vc-1",
		toolName: "shazam_verify",
		input: {},
		content: [{ type: "text", text }],
		isError,
	} as ToolResultEvent;
}

describe("hooks/stop-verify _reminderSent reset on verify error (#467)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetVerifyState();
	});

	it("re-fires a reminder after shazam_verify errors (#467)", () => {
		const { pi, emit, sentMessages } = createMockPi();
		registerStopVerify(pi);
		// session_start resets the module-level _lastReminderTimestamp debounce
		// so the first turn_end is not silently swallowed by a prior test.
		emit("session_start", { type: "session_start" });

		// 1) First turn_end with unverified edits -> reminder fires.
		emit("turn_end", { type: "turn_end" });
		expect(sentMessages.length).toBe(1);
		expect(wasReminderSent()).toBe(true);

		// 2) Agent attempts verify but it errors out.
		emit("tool_result", makeVerifyResult(true, "Error: LSP server crashed"));
		// Fix: _reminderSent must be reset so a future turn_end can re-remind.
		expect(wasReminderSent()).toBe(false);

		// 3) Advance past the 60s debounce, then next turn_end -> fresh reminder.
		vi.advanceTimersByTime(61_000);
		emit("turn_end", { type: "turn_end" });
		expect(sentMessages.length).toBe(2);
	});

	it("does NOT reset reminder when verify succeeds (markVerifyCalled already resets) (#467)", () => {
		const { pi, emit, sentMessages } = createMockPi();
		registerStopVerify(pi);
		emit("session_start", { type: "session_start" });

		emit("turn_end", { type: "turn_end" });
		expect(sentMessages.length).toBe(1);
		expect(wasReminderSent()).toBe(true);

		// Verify succeeds -> markVerifyCalled resets _reminderSent and sets
		// hasRecentVerify, so no further reminder fires.
		emit("tool_result", makeVerifyResult(false, "### Verdict: PASS"));
		expect(wasReminderSent()).toBe(false);

		// Advance past debounce; verify passed so hasRecentVerify blocks anyway.
		vi.advanceTimersByTime(61_000);
		emit("turn_end", { type: "turn_end" });
		// No new reminder: verify passed recently.
		expect(sentMessages.length).toBe(1);
	});
});
