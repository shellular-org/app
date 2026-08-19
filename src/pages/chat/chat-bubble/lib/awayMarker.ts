import type { AcpMessagePart } from "@shellular/protocol";

/** Below this the rule costs more attention than the information is worth. */
const MIN_STEPS = 2;

/** The protocol mixes seconds and milliseconds; `workLog.ts` normalises the same way. */
function timestampMs(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value < 10_000_000_000 ? value * 1_000 : value;
}

export function countStepsSince(
	parts: readonly AcpMessagePart[],
	lastSeenAt: number | undefined,
): number {
	const marker = timestampMs(lastSeenAt);
	if (marker === undefined) return 0;
	return parts.filter((part) => {
		const stamp = timestampMs((part as { timestamp?: unknown }).timestamp);
		return stamp !== undefined && stamp > marker;
	}).length;
}

/**
 * The marker is anchored to a stored `lastSeenAt`, never to the scroll
 * position: scrolling past 25 dense rows is scanning, not reading. Zulip ships
 * this distinction as a setting for the same reason.
 */
export function shouldShowAwayMarker(
	count: number,
	isAtBottom: boolean,
): boolean {
	return !isAtBottom && count >= MIN_STEPS;
}
