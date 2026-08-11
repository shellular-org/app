export interface TerminalDimensions {
	cols: number;
	rows: number;
}

function sameDimensions(
	left: TerminalDimensions | null,
	right: TerminalDimensions | null,
) {
	return left?.cols === right?.cols && left?.rows === right?.rows;
}

export function createTerminalResizeThrottle(
	send: (dimensions: TerminalDimensions) => void,
	interval = 100,
) {
	let disposed = false;
	let lastSentAt = Number.NEGATIVE_INFINITY;
	let lastSent: TerminalDimensions | null = null;
	let pending: TerminalDimensions | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const deliver = () => {
		timer = undefined;
		if (disposed || !pending) return;
		const next = pending;
		pending = null;
		if (sameDimensions(next, lastSent)) return;
		lastSent = next;
		lastSentAt = Date.now();
		send(next);
	};

	const schedule = (dimensions: TerminalDimensions) => {
		if (disposed || sameDimensions(dimensions, pending)) return;
		pending = dimensions;
		const remaining = interval - (Date.now() - lastSentAt);
		if (remaining <= 0) {
			if (timer) clearTimeout(timer);
			deliver();
		} else if (!timer) {
			timer = setTimeout(deliver, remaining);
		}
	};

	const flush = () => {
		if (timer) clearTimeout(timer);
		deliver();
	};

	const dispose = () => {
		disposed = true;
		pending = null;
		if (timer) clearTimeout(timer);
		timer = undefined;
	};

	return { schedule, flush, dispose };
}
