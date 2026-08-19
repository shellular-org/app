import type { AcpMessagePart } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import { countStepsSince, shouldShowAwayMarker } from "./awayMarker";

const at = (timestamp: number) =>
	({
		type: "tool_call",
		name: "execute",
		id: `t${timestamp}`,
		timestamp,
	}) as unknown as AcpMessagePart;

describe("countStepsSince", () => {
	it("counts nothing when the marker was never set", () => {
		expect(countStepsSince([at(1), at(2)], undefined)).toBe(0);
	});

	it("counts only parts newer than the marker", () => {
		expect(countStepsSince([at(1), at(2), at(3)], 1)).toBe(2);
	});

	it("normalises protocol seconds against millisecond markers", () => {
		// Without the normalisation a seconds stamp is always smaller than a
		// millisecond marker, so nothing would ever count as new.
		const marker = 1_700_000_001_000;
		expect(countStepsSince([at(1_700_000_000)], marker)).toBe(0);
		expect(countStepsSince([at(1_700_000_002)], marker)).toBe(1);
	});

	it("ignores parts that carry no timestamp", () => {
		expect(
			countStepsSince(
				[{ type: "text", text: "no stamp" } as AcpMessagePart, at(9_000)],
				1_000,
			),
		).toBe(1);
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
