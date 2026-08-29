import { describe, expect, it } from "vitest";
import {
	monacoTokenColor,
	normalizeMonacoColor,
	withMonacoAlpha,
} from "./monacoColor";

describe("Monaco color normalization", () => {
	it.each([
		["#abc", "#AABBCC"],
		["#abcd", "#AABBCCDD"],
		["#123456", "#123456"],
		["#12345678", "#12345678"],
		["rgb(60, 60, 67)", "#3C3C43"],
		["rgba(222, 214, 200, 0.66)", "#DED6C8A8"],
		["transparent", "#00000000"],
	])("converts %s to Monaco hex", (input, expected) => {
		expect(normalizeMonacoColor(input)).toBe(expected);
	});

	it("uses a valid fallback instead of Monaco's red invalid-color sentinel", () => {
		expect(
			normalizeMonacoColor("color-mix(in srgb, red, blue)", "#102030"),
		).toBe("#102030");
		expect(normalizeMonacoColor("invalid", "also invalid")).toBe("#000000");
	});

	it("can apply alpha and produce token colors without a hash", () => {
		expect(withMonacoAlpha("#5856D6", 0.2)).toBe("#5856D633");
		expect(monacoTokenColor("rgba(145, 197, 138, 0.5)")).toBe("91C58A");
	});
});
