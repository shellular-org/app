import { describe, expect, it } from "vitest";
import { normalizeEditorPath } from "./pathUtils";

describe("normalizeEditorPath", () => {
	it("does not prefix Windows absolute paths from chat file links", () => {
		expect(
			normalizeEditorPath(
				"D:\\Work\\First_EC.VL.CommerceTools\\README.md",
				"C:\\Users\\vitavdas",
			),
		).toEqual({
			path: "D:\\Work\\First_EC.VL.CommerceTools\\README.md",
			line: undefined,
			column: undefined,
		});
	});

	it("preserves Windows absolute paths with line and column suffixes", () => {
		expect(
			normalizeEditorPath(
				"C:\\Users\\vitavdas\\Documents\\WORK\\test\\index.ts:12:3",
				"C:\\Users\\vitavdas",
			),
		).toEqual({
			path: "C:\\Users\\vitavdas\\Documents\\WORK\\test\\index.ts",
			line: 12,
			column: 3,
		});
	});

	it("joins relative chat file links against a Windows workspace", () => {
		expect(
			normalizeEditorPath("src\\main.ts#L42", "C:\\Users\\vitavdas\\repo"),
		).toEqual({
			path: "C:\\Users\\vitavdas\\repo\\src\\main.ts",
			line: 42,
			column: undefined,
		});
	});
});
