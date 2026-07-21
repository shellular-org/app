import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("window resize lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetModules();
		document.body.classList.remove("resizing");
	});

	afterEach(() => {
		vi.useRealTimers();
		document.body.classList.remove("resizing");
	});

	it("emits one start and one settled event for a browser resize burst", async () => {
		const resize = (await import("./windowResize")).default;
		const onStart = vi.fn();
		const onSettled = vi.fn();
		resize.on("resizeStart", onStart);
		resize.on("resize", onSettled);

		resize();
		resize();
		expect(document.body).toHaveClass("resizing");
		expect(onStart).toHaveBeenCalledOnce();

		vi.advanceTimersByTime(100);
		expect(onSettled).toHaveBeenCalledOnce();
		expect(document.body).not.toHaveClass("resizing");
	});

	it("uses native start and end signals without waiting for the fallback timer", async () => {
		const resize = (await import("./windowResize")).default;
		const onStart = vi.fn();
		const onSettled = vi.fn();
		resize.on("resizeStart", onStart);
		resize.on("resize", onSettled);

		resize.start();
		resize.start();
		expect(onStart).toHaveBeenCalledOnce();
		expect(document.body).toHaveClass("resizing");

		resize.end();
		expect(onSettled).toHaveBeenCalledOnce();
		expect(document.body).not.toHaveClass("resizing");
	});

	it("does not emit a settled event without a matching start", async () => {
		const resize = (await import("./windowResize")).default;
		const onSettled = vi.fn();
		resize.on("resize", onSettled);

		resize.end();

		expect(onSettled).not.toHaveBeenCalled();
	});
});
