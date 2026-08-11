import { describe, expect, it } from "vitest";
import {
	normalizedExpandedPaneWeights,
	normalizePaneLayout,
	resizePanePair,
} from "./paneLayout";

describe("pane layout", () => {
	it("normalizes persisted entries and gives new panes equal weights", () => {
		expect(
			normalizePaneLayout(["a", "b"], {
				a: { expanded: false, weight: 2 },
				b: { expanded: "invalid", weight: 0 },
			}),
		).toEqual({
			a: { expanded: false, weight: 2 },
			b: { expanded: true, weight: 1 },
		});
	});

	it("resizes only adjacent expanded panes and preserves total weight", () => {
		const layout = normalizePaneLayout(["a", "b"]);
		const resized = resizePanePair(layout, "a", "b", 0.5, 0.2);
		expect(resized.a.weight).toBe(1.5);
		expect(resized.b.weight).toBe(0.5);
		expect(resized.a.weight + resized.b.weight).toBe(2);

		const collapsed = { ...layout, b: { ...layout.b, expanded: false } };
		expect(resizePanePair(collapsed, "a", "b", 0.5, 0.2)).toBe(collapsed);
	});

	it("normalizes only expanded weights so they always consume free space", () => {
		const entries = [
			{ expanded: true, weight: 0.25 },
			{ expanded: false, weight: 4 },
			{ expanded: true, weight: 0.75 },
		];
		const normalized = normalizedExpandedPaneWeights(entries);
		expect(normalized.get(entries[0])).toBeCloseTo(0.5);
		expect(normalized.get(entries[2])).toBeCloseTo(1.5);
		expect(normalized.has(entries[1])).toBe(false);

		const single = normalizedExpandedPaneWeights([
			{ expanded: true, weight: 0.2 },
			{ expanded: false, weight: 3 },
		]);
		expect([...single.values()]).toEqual([1]);
	});
});
