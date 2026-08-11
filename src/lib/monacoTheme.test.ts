import darkTheme from "themes/dark";
import { toThemeId } from "themes/id";
import lightTheme from "themes/light";
import oledTheme from "themes/oled";
import {
	catppuccinMochaTheme,
	draculaTheme,
	githubDarkTheme,
	githubLightTheme,
	oneDarkProTheme,
	tokyoNightTheme,
} from "themes/popular";
import { describe, expect, it } from "vitest";
import { normalizeMonacoColor } from "./monacoColor";
import { createMonacoTheme, monacoThemeName } from "./monacoTheme";

const MONACO_HEX = /^#[\dA-F]{6}(?:[\dA-F]{2})?$/;
const ALL_THEMES = [
	lightTheme,
	darkTheme,
	oledTheme,
	oneDarkProTheme,
	draculaTheme,
	githubDarkTheme,
	githubLightTheme,
	tokyoNightTheme,
	catppuccinMochaTheme,
] as const;

describe("Shellular Monaco themes", () => {
	it.each([
		[lightTheme, "vs"],
		[darkTheme, "vs-dark"],
		[oledTheme, "vs-dark"],
		[oneDarkProTheme, "vs-dark"],
		[draculaTheme, "vs-dark"],
		[githubDarkTheme, "vs-dark"],
		[githubLightTheme, "vs"],
		[tokyoNightTheme, "vs-dark"],
		[catppuccinMochaTheme, "vs-dark"],
	] as const)("maps %s to a complete editor theme", (theme, base) => {
		const result = createMonacoTheme(theme);
		expect(result.base).toBe(base);
		expect(result.colors["editor.background"]).toBe(
			normalizeMonacoColor(theme.primary),
		);
		expect(result.colors["editor.foreground"]).toBe(
			normalizeMonacoColor(theme.primaryText),
		);
		expect(result.colors.focusBorder).toBe(normalizeMonacoColor(theme.accent));
		expect(result.colors["diffEditor.insertedTextBackground"]).toBeTruthy();
		expect(monacoThemeName(theme)).toContain(toThemeId(theme.name));
	});

	it.each(ALL_THEMES)("emits only valid Monaco colors for %s", (theme) => {
		const result = createMonacoTheme(theme);
		for (const color of Object.values(result.colors)) {
			expect(color).toMatch(MONACO_HEX);
		}
		for (const rule of result.rules) {
			if (rule.foreground) expect(`#${rule.foreground}`).toMatch(MONACO_HEX);
		}
	});

	it.each(ALL_THEMES)("matches editor chrome and scrollbars to %s", (theme) => {
		const colors = createMonacoTheme(theme).colors;
		expect(colors["editorLineNumber.foreground"]).toBe(
			normalizeMonacoColor(theme.textMuted),
		);
		expect(colors["editor.lineHighlightBackground"]).toBe(
			normalizeMonacoColor(theme.surfaceSoft),
		);
		expect(colors["editorGutter.background"]).toBe(
			normalizeMonacoColor(theme.primary),
		);
		expect(colors["scrollbarSlider.background"]).toBe(
			normalizeMonacoColor(theme.scrollbarThumb),
		);
		expect(colors["editorLineNumber.foreground"]).not.toBe("#FF0000");
		expect(colors["editor.lineHighlightBackground"]).not.toBe("#FF0000");
		expect(theme.xtermTheme.scrollbarSliderBackground).toBe(
			theme.scrollbarThumb,
		);
		expect(theme.xtermTheme.scrollbarSliderHoverBackground).toBe(
			theme.scrollbarThumbHover,
		);
		expect(theme.xtermTheme.scrollbarSliderActiveBackground).toBe(
			theme.scrollbarThumbActive,
		);
	});

	it.each(ALL_THEMES)("uses the semantic syntax palette for %s", (theme) => {
		const rules = createMonacoTheme(theme).rules;
		const foreground = (token: string) =>
			rules.find((rule) => rule.token === token)?.foreground;

		expect(foreground("keyword")).toBe(
			normalizeMonacoColor(theme.syntaxTheme.keyword).slice(1, 7),
		);
		expect(foreground("string")).toBe(
			normalizeMonacoColor(theme.syntaxTheme.string).slice(1, 7),
		);
		expect(foreground("function")).toBe(
			normalizeMonacoColor(theme.syntaxTheme.function).slice(1, 7),
		);
	});
});
