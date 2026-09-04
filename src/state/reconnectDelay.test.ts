import { describe, expect, it, vi } from "vitest";
import { getReconnectDelayMs } from "./reconnectDelay";

describe("getReconnectDelayMs", () => {
	it("does not delay an explicit recovery attempt", () => {
		const random = vi.fn(() => 0.5);

		expect(getReconnectDelayMs(1, true, random)).toBe(0);
		expect(random).not.toHaveBeenCalled();
	});

	it("preserves jittered backoff for ordinary reconnects", () => {
		expect(getReconnectDelayMs(1, false, () => 0)).toBe(800);
		expect(getReconnectDelayMs(2, false, () => 0.5)).toBe(2_000);
		expect(getReconnectDelayMs(3, false, () => 1)).toBeCloseTo(4_800);
	});

	it("uses the final backoff value after the configured ladder", () => {
		expect(getReconnectDelayMs(99, false, () => 0.5)).toBe(16_000);
	});
});
