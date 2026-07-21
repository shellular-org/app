import { describe, expect, it } from "vitest";
import {
	type NativeContextMenuViewport,
	toLayoutViewportAnchor,
} from "./native";

const viewport: NativeContextMenuViewport = {
	layoutWidth: 1200,
	layoutHeight: 800,
	visualWidth: 600,
	visualHeight: 400,
	visualOffsetLeft: 125,
	visualOffsetTop: 75,
	visualScale: 2,
	deviceScaleFactor: 4,
};

describe("native context-menu viewport payload", () => {
	it("converts a visual-viewport point into layout coordinates", () => {
		expect(
			toLayoutViewportAnchor({ kind: "point", x: 20, y: 30 }, viewport),
		).toEqual({ kind: "point", x: 145, y: 105 });
	});

	it("converts every edge of an anchor rectangle", () => {
		expect(
			toLayoutViewportAnchor(
				{ kind: "rect", left: 1, top: 2, right: 31, bottom: 42 },
				viewport,
			),
		).toEqual({
			kind: "rect",
			left: 126,
			top: 77,
			right: 156,
			bottom: 117,
		});
	});
});
