import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalResizeThrottle } from "./terminalResize";

describe("createTerminalResizeThrottle", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("sends the first dimensions immediately and coalesces a burst", () => {
		const send = vi.fn();
		const throttle = createTerminalResizeThrottle(send, 100);

		throttle.schedule({ cols: 80, rows: 24 });
		throttle.schedule({ cols: 90, rows: 30 });
		throttle.schedule({ cols: 100, rows: 32 });

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenLastCalledWith({ cols: 80, rows: 24 });
		vi.advanceTimersByTime(100);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenLastCalledWith({ cols: 100, rows: 32 });
	});

	it("flushes the exact final dimensions", () => {
		const send = vi.fn();
		const throttle = createTerminalResizeThrottle(send, 100);
		throttle.schedule({ cols: 80, rows: 24 });
		throttle.schedule({ cols: 120, rows: 40 });

		throttle.flush();

		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenLastCalledWith({ cols: 120, rows: 40 });
	});

	it("does not send duplicates or pending work after disposal", () => {
		const send = vi.fn();
		const throttle = createTerminalResizeThrottle(send, 100);
		throttle.schedule({ cols: 80, rows: 24 });
		throttle.schedule({ cols: 80, rows: 24 });
		throttle.schedule({ cols: 90, rows: 30 });
		throttle.dispose();
		vi.runAllTimers();

		expect(send).toHaveBeenCalledTimes(1);
	});
});
