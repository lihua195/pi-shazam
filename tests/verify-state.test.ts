/**
 * Tests for hooks/verify-state — shared verify tracking.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
	markVerifyCalled,
	hasRecentVerify,
	hasRecentPassingVerify,
	resetVerifyState,
	onNewEdit,
	markReminderSent,
	wasReminderSent,
	resetReminderSent,
} from "../hooks/verify-state.js";

describe("hooks/verify-state", () => {
	beforeEach(() => {
		resetVerifyState();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should return false initially (no verify called)", () => {
		expect(hasRecentVerify()).toBe(false);
	});

	it("should return true after markVerifyCalled", () => {
		markVerifyCalled();
		expect(hasRecentVerify()).toBe(true);
	});

	it("should return false after verify state is reset", () => {
		markVerifyCalled();
		expect(hasRecentVerify()).toBe(true);
		resetVerifyState();
		expect(hasRecentVerify()).toBe(false);
	});

	it("should return false when verify was called more than 5 minutes ago", () => {
		markVerifyCalled();
		expect(hasRecentVerify()).toBe(true);

		// Advance 6 minutes
		vi.advanceTimersByTime(6 * 60 * 1000);
		expect(hasRecentVerify()).toBe(false);
	});

	it("should return true when verify was called within 5 minutes", () => {
		markVerifyCalled();
		vi.advanceTimersByTime(4 * 60 * 1000);
		expect(hasRecentVerify()).toBe(true);
	});

	it("should reset verify flag on onNewEdit (post-verify edit detection)", () => {
		markVerifyCalled();
		expect(hasRecentVerify()).toBe(true);

		// Simulate a new edit after verify
		onNewEdit();
		expect(hasRecentVerify()).toBe(false);
	});

	it("should re-enable verify detection after onNewEdit + markVerifyCalled", () => {
		markVerifyCalled();
		onNewEdit();
		expect(hasRecentVerify()).toBe(false);

		// Verify again
		markVerifyCalled();
		expect(hasRecentVerify()).toBe(true);
	});

	describe("reminder deduplication", () => {
		it("should return false initially (no reminder sent)", () => {
			expect(wasReminderSent()).toBe(false);
		});

		it("should return true after markReminderSent", () => {
			markReminderSent();
			expect(wasReminderSent()).toBe(true);
		});

		it("should reset reminder flag on onNewEdit", () => {
			markReminderSent();
			expect(wasReminderSent()).toBe(true);
			onNewEdit();
			expect(wasReminderSent()).toBe(false);
		});

		it("should reset reminder flag on markVerifyCalled", () => {
			markReminderSent();
			expect(wasReminderSent()).toBe(true);
			markVerifyCalled();
			expect(wasReminderSent()).toBe(false);
		});

		it("should reset reminder flag on resetVerifyState", () => {
			markReminderSent();
			expect(wasReminderSent()).toBe(true);
			resetVerifyState();
			expect(wasReminderSent()).toBe(false);
		});

		it("should prevent repeated reminders: only one per batch of unverified edits", () => {
			// First reminder is allowed
			expect(wasReminderSent()).toBe(false);
			markReminderSent();
			expect(wasReminderSent()).toBe(true);

			// Second reminder is blocked (flag already set)
			// Simulate turn_end checking wasReminderSent() before sending
			expect(wasReminderSent()).toBe(true);

			// New edit resets the flag, allowing a fresh reminder
			onNewEdit();
			expect(wasReminderSent()).toBe(false);
			markReminderSent();
			expect(wasReminderSent()).toBe(true);
		});

		it("should allow reminder after verify + new edit cycle", () => {
		// Send reminder, then verify
		markReminderSent();
		markVerifyCalled();
		expect(wasReminderSent()).toBe(false);

		// New edit after verify: reminder should be allowed again
		onNewEdit();
		expect(wasReminderSent()).toBe(false);
		markReminderSent();
		expect(wasReminderSent()).toBe(true);
	});

	it("resetReminderSent clears the reminder flag (#467)", () => {
		markReminderSent();
		expect(wasReminderSent()).toBe(true);
		resetReminderSent();
		expect(wasReminderSent()).toBe(false);
	});
	});

	// -------------------------------------------------------------------------
	// FAIL verdict parsing (text-based fallback) -- #467 Finding 1
	//
	// The text fallback regex only matched "[FAIL] NOT READY". A bare [FAIL]
	// with any other suffix (e.g. "[FAIL] 5 errors found") or a "Verdict: FAIL"
	// line bypassed the check, producing a false PASS (hasRecentPassingVerify
	// returned true despite a FAIL verdict). The fix also matches a standalone
	// [FAIL] token and a "Verdict: FAIL" line.
	// -------------------------------------------------------------------------
	describe("FAIL verdict parsing (text fallback, #467)", () => {
		beforeEach(() => {
			resetVerifyState();
		});

		it("treats '[FAIL] NOT READY' as not passing", () => {
			markVerifyCalled("### Status: [FAIL] NOT READY");
			expect(hasRecentPassingVerify()).toBe(false);
		});

		it("treats a bare '[FAIL]' with other suffix as not passing (#467)", () => {
			// Previously bypassed: regex required "[FAIL] NOT READY" literally.
			markVerifyCalled("[FAIL] 5 errors found, 2 warnings");
			expect(hasRecentPassingVerify()).toBe(false);
		});

		it("treats 'Verdict: FAIL' line as not passing (#467)", () => {
			// Non-preCommit verify emits "### Verdict: FAIL" (no [FAIL] token).
			markVerifyCalled("### Verdict: FAIL");
			expect(hasRecentPassingVerify()).toBe(false);
		});

		it("treats '[PASS]' as passing", () => {
			markVerifyCalled("[PASS] READY");
			expect(hasRecentPassingVerify()).toBe(true);
		});

		it("treats 'Verdict: PASS' as passing (#467)", () => {
			markVerifyCalled("### Verdict: PASS");
			expect(hasRecentPassingVerify()).toBe(true);
		});
	});
});
