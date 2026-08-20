import { describe, expect, it } from "vitest";
import { elideCommand, elidePath } from "./elide";

const LONG_PATH =
	"backends/real-commerce/.ai/concepts/2026-07-04 Contract-Price/adrs/04-tax-basis.md";

describe("elidePath", () => {
	it("returns a path that already fits unchanged", () => {
		expect(elidePath("src/lib/store.ts", 44)).toBe("src/lib/store.ts");
	});

	it("keeps the basename intact and drops the middle", () => {
		const result = elidePath(LONG_PATH, 44);
		expect(result).toContain("04-tax-basis.md");
		expect(result.startsWith("…/")).toBe(true);
		expect(result.length).toBeLessThanOrEqual(44);
	});

	it("keeps the closest directory when it still fits", () => {
		expect(elidePath(LONG_PATH, 44)).toContain("adrs/");
	});

	it("keeps the tail when the basename alone exceeds the budget", () => {
		const result = elidePath(`a/${"x".repeat(60)}.md`, 20);
		expect(result.startsWith("…")).toBe(true);
		expect(result.length).toBe(20);
		expect(result.endsWith(".md")).toBe(true);
	});

	it("ignores a trailing slash", () => {
		expect(elidePath("src/lib/", 44)).toBe("src/lib");
	});

	it("does not elide when the ellipsis would save fewer than three characters", () => {
		// Carbon: an ellipsis "should represent three or more truncated characters".
		expect(elidePath("src/lib/abcd.ts", 14)).toBe("src/lib/abcd.ts");
	});

	it("never leaves fewer than four untruncated characters", () => {
		// Carbon and PatternFly both set this floor.
		expect(
			elidePath(`a/${"x".repeat(60)}.md`, 4).length,
		).toBeGreaterThanOrEqual(5);
	});

	it("defaults to a budget that fits the narrowest column it renders in", () => {
		// The settled rail is 281 CSS px at 390px, and the mono face advances
		// 7.2px per character. A longer default is clipped again by CSS, at the
		// tail, which is where the basename is.
		expect(elidePath(LONG_PATH).length).toBeLessThanOrEqual(36);
		expect(elidePath(LONG_PATH)).toContain("04-tax-basis.md");
	});
});

describe("elideCommand", () => {
	it("keeps only the first line", () => {
		expect(elideCommand("git status\ngit log", 48)).toBe("git status");
	});

	it("keeps the head and marks the cut", () => {
		const result = elideCommand(`git log ${"-".repeat(80)}`, 20);
		expect(result.startsWith("git log")).toBe(true);
		expect(result.length).toBe(20);
		expect(result.endsWith("…")).toBe(true);
	});
});
