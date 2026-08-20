import type { AcpMessagePart } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import {
	countStepsSince,
	countWorkSteps,
	shouldShowAwayMarker,
} from "./awayMarker";

const step = (id: string) =>
	({ type: "tool_call", name: "execute", id }) as AcpMessagePart;

describe("countWorkSteps", () => {
	it("counts the work parts and ignores commentary", () => {
		expect(
			countWorkSteps([
				step("a"),
				{ type: "text", text: "Checking." },
				step("b"),
			]),
		).toBe(2);
	});
});

describe("countStepsSince", () => {
	it("counts nothing when the marker was never set", () => {
		expect(countStepsSince("m1", 7, undefined)).toBe(0);
	});

	it("counts what the turn gained since the marker", () => {
		expect(countStepsSince("m1", 9, { messageKey: "m1", steps: 4 })).toBe(5);
	});

	it("counts a whole new turn as new", () => {
		// The turn on screen when you left is finished; this one arrived after.
		expect(countStepsSince("m2", 6, { messageKey: "m1", steps: 4 })).toBe(6);
	});

	it("never goes negative when the turn shrank", () => {
		expect(countStepsSince("m1", 2, { messageKey: "m1", steps: 4 })).toBe(0);
	});

	it("counts nothing while the turn has not moved", () => {
		expect(countStepsSince("m1", 4, { messageKey: "m1", steps: 4 })).toBe(0);
	});
});

describe("shouldShowAwayMarker", () => {
	it("stays hidden while the reader is pinned to the bottom", () => {
		expect(shouldShowAwayMarker(12, true)).toBe(false);
	});

	it("shows once there is something missed and the view is scrolled up", () => {
		expect(shouldShowAwayMarker(12, false)).toBe(true);
	});

	it("stays hidden for a single step, which is not worth a rule", () => {
		expect(shouldShowAwayMarker(1, false)).toBe(false);
	});
});
