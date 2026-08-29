import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeElementResize } from "./elementResize";

class TestResizeObserver {
	static instance: TestResizeObserver | undefined;
	private readonly callback: ResizeObserverCallback;
	disconnect = vi.fn();
	observe = vi.fn();

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		TestResizeObserver.instance = this;
	}

	emit(target: Element, width: number, height: number) {
		this.callback(
			[
				{
					target,
					contentRect: { width, height },
				} as ResizeObserverEntry,
			],
			this as unknown as ResizeObserver,
		);
	}
}

describe("observeElementResize", () => {
	let frames: FrameRequestCallback[];

	beforeEach(() => {
		vi.useFakeTimers();
		frames = [];
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		TestResizeObserver.instance = undefined;
	});

	it("delivers a positive initial size immediately", () => {
		const element = document.createElement("div");
		vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
			width: 640.8,
			height: 480.4,
		} as DOMRect);
		const onFrame = vi.fn();

		observeElementResize(element, { onFrame });

		expect(onFrame).toHaveBeenCalledWith({ width: 640, height: 480 });
	});

	it("coalesces a resize burst into the latest frame", () => {
		const element = document.createElement("div");
		const onFrame = vi.fn();
		observeElementResize(element, { onFrame });
		TestResizeObserver.instance?.emit(element, 800, 600);
		TestResizeObserver.instance?.emit(element, 900, 700);

		expect(frames).toHaveLength(1);
		frames.shift()?.(0);
		expect(onFrame).toHaveBeenCalledTimes(1);
		expect(onFrame).toHaveBeenCalledWith({ width: 900, height: 700 });
	});

	it("delivers pre-paint sizes without adding an animation-frame delay", () => {
		const element = document.createElement("div");
		const onFrame = vi.fn();
		observeElementResize(element, { onFrame, delivery: "pre-paint" });

		TestResizeObserver.instance?.emit(element, 800, 600);

		expect(onFrame).toHaveBeenCalledWith({ width: 800, height: 600 });
		expect(frames).toHaveLength(0);
	});

	it("ignores zero and duplicate sizes", () => {
		const element = document.createElement("div");
		const onFrame = vi.fn();
		observeElementResize(element, { onFrame });
		TestResizeObserver.instance?.emit(element, 0, 700);
		TestResizeObserver.instance?.emit(element, 800, 600);
		frames.shift()?.(0);
		TestResizeObserver.instance?.emit(element, 800, 600);

		expect(onFrame).toHaveBeenCalledTimes(1);
	});

	it("lays out a hidden element when its tab becomes visible", () => {
		const element = document.createElement("div");
		const onFrame = vi.fn();
		observeElementResize(element, { onFrame });

		TestResizeObserver.instance?.emit(element, 0, 0);
		TestResizeObserver.instance?.emit(element, 720, 540);
		frames.shift()?.(0);

		expect(onFrame).toHaveBeenCalledOnce();
		expect(onFrame).toHaveBeenCalledWith({ width: 720, height: 540 });
	});

	it("flushes the final size and cleans up pending work", () => {
		const element = document.createElement("div");
		const onFrame = vi.fn();
		const onSettled = vi.fn();
		const dispose = observeElementResize(element, {
			onFrame,
			onSettled,
			settleDelay: 50,
		});
		TestResizeObserver.instance?.emit(element, 1024, 768);

		vi.advanceTimersByTime(50);
		expect(onFrame).toHaveBeenCalledWith({ width: 1024, height: 768 });
		expect(onSettled).toHaveBeenCalledWith({ width: 1024, height: 768 });

		dispose();
		expect(TestResizeObserver.instance?.disconnect).toHaveBeenCalled();
	});
});
