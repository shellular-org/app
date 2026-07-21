export interface ElementSize {
	width: number;
	height: number;
}

export interface ElementResizeHandlers {
	onFrame: (size: ElementSize) => void;
	onSettled?: (size: ElementSize) => void;
	settleDelay?: number;
	delivery?: "animation-frame" | "pre-paint";
}

const DEFAULT_SETTLE_DELAY = 100;

function normalizeSize(width: number, height: number): ElementSize | null {
	const normalized = {
		width: Math.floor(width),
		height: Math.floor(height),
	};
	return normalized.width > 0 && normalized.height > 0 ? normalized : null;
}

function sameSize(left: ElementSize | null, right: ElementSize | null) {
	return left?.width === right?.width && left?.height === right?.height;
}

/**
 * Observe an element without letting resize bursts schedule more than one
 * expensive layout per display frame. A final callback is emitted once the
 * element has remained stable long enough for terminal/editor finalization.
 */
export function observeElementResize(
	element: Element,
	handlers: ElementResizeHandlers,
) {
	let disposed = false;
	let frame = 0;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let pending: ElementSize | null = null;
	let delivered: ElementSize | null = null;

	const deliver = () => {
		frame = 0;
		if (disposed || !pending || sameSize(pending, delivered)) return;
		delivered = pending;
		handlers.onFrame(delivered);
	};

	const settle = () => {
		settleTimer = undefined;
		if (disposed || !pending) return;
		if (frame) {
			cancelAnimationFrame(frame);
			frame = 0;
		}
		deliver();
		if (delivered) handlers.onSettled?.(delivered);
	};

	const schedule = (size: ElementSize | null, immediate = false) => {
		if (disposed || !size || sameSize(size, pending)) return;
		pending = size;
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(
			settle,
			handlers.settleDelay ?? DEFAULT_SETTLE_DELAY,
		);
		if (immediate) {
			deliver();
		} else if (handlers.delivery === "pre-paint") {
			deliver();
		} else if (!frame) {
			frame = requestAnimationFrame(deliver);
		}
	};

	const rect = element.getBoundingClientRect();
	schedule(normalizeSize(rect.width, rect.height), true);

	const observer = new ResizeObserver((entries) => {
		const entry = entries.find((candidate) => candidate.target === element);
		if (!entry) return;
		schedule(normalizeSize(entry.contentRect.width, entry.contentRect.height));
	});
	observer.observe(element);

	return () => {
		disposed = true;
		observer.disconnect();
		if (frame) cancelAnimationFrame(frame);
		if (settleTimer) clearTimeout(settleTimer);
	};
}
