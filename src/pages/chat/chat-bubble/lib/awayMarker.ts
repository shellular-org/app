import type { AcpMessagePart } from "@shellular/protocol";
import { isWorkActionPart } from "./workLog";

/** Below this the rule costs more attention than the information is worth. */
const MIN_STEPS = 2;

/**
 * Where reading stopped, stored per chat.
 *
 * It counts steps rather than storing a timestamp, because **the wire carries
 * no timestamp per part** — only `AcpMessage` has one, and a turn that was
 * already running when you left keeps its original stamp however many steps it
 * adds while you are away. Comparing stamps would therefore have reported
 * nothing, every time. Counting what was on screen when you left is the only
 * measurement the available data supports, and it is the one the reader
 * actually means.
 */
export interface AwayMarker {
	/** Which turn was on screen, so a new turn is not mistaken for growth. */
	messageKey: string;
	/** How many work steps that turn had at the time. */
	steps: number;
}

/** How many work steps a turn has, which is what the reader counts as "steps". */
export function countWorkSteps(parts: readonly AcpMessagePart[]): number {
	return parts.filter(isWorkActionPart).length;
}

export function countStepsSince(
	currentKey: string | undefined,
	currentSteps: number,
	marker: AwayMarker | undefined,
): number {
	if (!marker || !currentKey) return 0;
	// A different turn means everything on screen arrived after you left.
	if (marker.messageKey !== currentKey) return currentSteps;
	return Math.max(0, currentSteps - marker.steps);
}

/**
 * The marker is anchored to what was on screen when you left, never to the
 * scroll position: scrolling past twenty-five dense rows is scanning, not
 * reading. Zulip ships this distinction as a setting for the same reason.
 */
export function shouldShowAwayMarker(
	count: number,
	isAtBottom: boolean,
): boolean {
	return !isAtBottom && count >= MIN_STEPS;
}
