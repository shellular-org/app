import { describe, expect, it } from "vitest";
import { placeContextMenu } from "./position";

const viewport = { left: 0, top: 0, width: 800, height: 600 };

describe("placeContextMenu", () => {
	it("keeps a point menu inside every viewport edge", () => {
		expect(
			placeContextMenu(
				{ kind: "point", x: 790, y: 590 },
				{ width: 200, height: 300 },
				viewport,
			),
		).toMatchObject({ left: 590, top: 290 });
		expect(
			placeContextMenu(
				{ kind: "point", x: -20, y: -20 },
				{ width: 200, height: 300 },
				viewport,
			),
		).toMatchObject({ left: 8, top: 8 });
	});

	it("opens a rect menu above and to the left when needed", () => {
		expect(
			placeContextMenu(
				{ kind: "rect", left: 750, right: 780, top: 520, bottom: 550 },
				{ width: 220, height: 200 },
				viewport,
			),
		).toMatchObject({ left: 560, top: 320 });
	});

	it("accounts for an offset visual viewport", () => {
		const placed = placeContextMenu(
			{ kind: "point", x: 120, y: 90 },
			{ width: 300, height: 200 },
			{ left: 100, top: 50, width: 320, height: 240 },
		);
		expect(placed).toMatchObject({ left: 108, top: 58, maxHeight: 224 });
	});
});
