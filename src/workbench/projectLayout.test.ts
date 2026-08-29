import { describe, expect, it } from "vitest";
import { normalizeProjectLayout, resizePanePair } from "./projectLayout";

describe("macOS project pane layout", () => {
	it("restores pane preferences while ignoring legacy view modes", () => {
		const layout = normalizeProjectLayout(["/alpha", "/beta"], {
			"/alpha": { expanded: false, mode: "sessions", weight: 2.5 },
			"/beta": { expanded: "yes", mode: "unknown", weight: -4 },
		});

		expect(layout).toEqual({
			"/alpha": { expanded: false, weight: 2.5 },
			"/beta": { expanded: false, weight: 1 },
		});
	});

	it("opens only the first project when no layout has been saved", () => {
		expect(normalizeProjectLayout(["/alpha", "/beta"])).toEqual({
			"/alpha": { expanded: true, weight: 1 },
			"/beta": { expanded: false, weight: 1 },
		});
	});

	it("resizes adjacent expanded panes while preserving their total height", () => {
		const layout = normalizeProjectLayout(["/alpha", "/beta"], {
			"/alpha": { expanded: true },
			"/beta": { expanded: true },
		});
		const resized = resizePanePair(layout, "/alpha", "/beta", 0.4, 0.2);

		expect(resized["/alpha"].weight).toBeCloseTo(1.4);
		expect(resized["/beta"].weight).toBeCloseTo(0.6);
		expect(resized["/alpha"].weight + resized["/beta"].weight).toBeCloseTo(2);
	});

	it("clamps pane resizing and ignores collapsed pairs", () => {
		const layout = normalizeProjectLayout(["/alpha", "/beta"], {
			"/alpha": { expanded: true },
			"/beta": { expanded: true },
		});
		const clamped = resizePanePair(layout, "/alpha", "/beta", 10, 0.25);
		expect(clamped["/alpha"].weight).toBe(1.75);
		expect(clamped["/beta"].weight).toBe(0.25);

		const collapsed = {
			...layout,
			"/beta": { ...layout["/beta"], expanded: false },
		};
		expect(resizePanePair(collapsed, "/alpha", "/beta", 0.5, 0.25)).toBe(
			collapsed,
		);
	});
});
