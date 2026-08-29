import { describe, expect, it } from "vitest";
import themes, { themeOptions } from ".";
import { toThemeId } from "./id";

const ANSI_COLORS = [
	"black",
	"red",
	"green",
	"yellow",
	"blue",
	"magenta",
	"cyan",
	"white",
	"brightBlack",
	"brightRed",
	"brightGreen",
	"brightYellow",
	"brightBlue",
	"brightMagenta",
	"brightCyan",
	"brightWhite",
] as const;

const COLOR = /^(#[\dA-F]{6}(?:[\dA-F]{2})?|rgba?\(|transparent$)/i;

function relativeLuminance(hex: string): number {
	const channels = hex
		.slice(1)
		.match(/.{2}/g)
		?.map((channel) => Number.parseInt(channel, 16) / 255);
	if (!channels || channels.length !== 3) {
		throw new Error(`Expected a six-digit hex color, received ${hex}`);
	}
	const [red, green, blue] = channels.map((channel) =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	);
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
	const lighter = Math.max(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);
	const darker = Math.min(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);
	return (lighter + 0.05) / (darker + 0.05);
}

describe("theme catalog", () => {
	it("exposes unique canonical IDs and labels", () => {
		expect(new Set(themeOptions.map(({ id }) => id)).size).toBe(
			themeOptions.length,
		);
		expect(new Set(themeOptions.map(({ label }) => label)).size).toBe(
			themeOptions.length,
		);
		expect(themeOptions.map(({ id }) => id)).toEqual(
			expect.arrayContaining([
				"one-dark-pro",
				"dracula",
				"github-dark",
				"github-light",
				"tokyo-night",
				"catppuccin-mocha",
			]),
		);
	});

	it.each([
		["One Dark Pro", "one-dark-pro"],
		["github dark default", "github-dark"],
		["black", "oled"],
		["does-not-exist", "dark"],
	])("resolves %s to %s", (input, expected) => {
		expect(themes.resolveId(input)).toBe(expected);
	});

	it("distinguishes supported names from fallback behavior", () => {
		expect(themes.has("GitHub Light")).toBe(true);
		expect(themes.has("github-light")).toBe(true);
		expect(themes.has("black")).toBe(true);
		expect(themes.has("does-not-exist")).toBe(false);
	});

	it("normalizes display names into stable IDs", () => {
		expect(toThemeId("  Catppuccin Mocha  ")).toBe("catppuccin-mocha");
		expect(toThemeId("GitHub Light Default")).toBe("github-light-default");
	});

	it("loads every option with complete editor and terminal palettes", async () => {
		for (const option of themeOptions) {
			const theme = await themes.get(option.id);
			expect(theme.name).toBe(option.label);
			expect(theme.type).toBe(option.type);

			for (const value of Object.values(theme.syntaxTheme)) {
				expect(value).toMatch(COLOR);
			}
			for (const key of ANSI_COLORS) {
				expect(theme.xtermTheme[key]).toMatch(COLOR);
			}

			expect(theme.xtermTheme.scrollbarSliderBackground).toBe(
				theme.scrollbarThumb,
			);
			expect(theme.xtermTheme.scrollbarSliderHoverBackground).toBe(
				theme.scrollbarThumbHover,
			);
			expect(theme.xtermTheme.scrollbarSliderActiveBackground).toBe(
				theme.scrollbarThumbActive,
			);
			expect(theme.cardSubtextOpacity).toBe(
				option.id === "dracula" ? "1" : "0.6",
			);
		}
	});

	it("keeps Dracula card subtext readable without changing editor or terminal muted colors", async () => {
		const theme = await themes.get("dracula");

		expect(theme.secondaryText).toBe("#B8BBD8");
		for (const background of [
			theme.primary,
			theme.secondary,
			theme.surfaceStrong,
		]) {
			expect(
				contrastRatio(theme.secondaryText, background),
			).toBeGreaterThanOrEqual(4.5);
		}
		expect(theme.syntaxTheme.comment).toBe("#6272A4");
		expect(theme.xtermTheme.brightBlack).toBe("#6272A4");
		expect(theme.textMuted).toBe("#6272A4");
	});
});
