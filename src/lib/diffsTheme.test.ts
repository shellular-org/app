import themes, { themeOptions } from "themes";
import { describe, expect, it } from "vitest";
import { createDiffTheme, diffThemeNameFromId } from "./diffsTheme";

describe("Shellular diff themes", () => {
	it("creates a registered-name-compatible Shiki theme for every app theme", async () => {
		for (const option of themeOptions) {
			const theme = await themes.get(option.id);
			const diffTheme = createDiffTheme(theme);

			expect(diffTheme.name).toBe(diffThemeNameFromId(option.id));
			expect(diffTheme.type).toBe(option.type);
			expect(diffTheme.colors["editor.background"]).toBe(theme.primary);
			expect(diffTheme.colors["editor.foreground"]).toBe(theme.primaryText);
			expect(diffTheme.tokenColors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						scope: expect.arrayContaining(["keyword"]),
						settings: expect.objectContaining({
							foreground: theme.syntaxTheme.keyword,
						}),
					}),
					expect.objectContaining({
						scope: expect.arrayContaining(["string"]),
						settings: expect.objectContaining({
							foreground: theme.syntaxTheme.string,
						}),
					}),
				]),
			);
		}
	});
});
