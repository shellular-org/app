import darkTheme from "themes/dark";
import lightTheme from "themes/light";
import oledTheme from "themes/oled";
import { describe, expect, it } from "vitest";
import { normalizeMonacoColor } from "./monacoColor";
import { createMonacoTheme, monacoThemeName } from "./monacoTheme";

const MONACO_HEX = /^#[\dA-F]{6}(?:[\dA-F]{2})?$/;

describe("Shellular Monaco themes", () => {
	it.each([
		[lightTheme, "vs"],
		[darkTheme, "vs-dark"],
		[oledTheme, "vs-dark"],
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
		expect(monacoThemeName(theme)).toContain(theme.name.toLowerCase());
	});

	it.each([
		lightTheme,
		darkTheme,
		oledTheme,
	])("emits only valid Monaco colors for %s", (theme) => {
		const result = createMonacoTheme(theme);
		for (const color of Object.values(result.colors)) {
			expect(color).toMatch(MONACO_HEX);
		}
		for (const rule of result.rules) {
			if (rule.foreground) expect(`#${rule.foreground}`).toMatch(MONACO_HEX);
		}
	});

	it.each([
		lightTheme,
		darkTheme,
		oledTheme,
	])("matches editor chrome and scrollbars to %s", (theme) => {
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
});
