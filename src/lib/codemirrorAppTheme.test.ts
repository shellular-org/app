import themes, { themeOptions } from "themes";
import { describe, expect, it } from "vitest";
import { createCodeMirrorAppTheme } from "./codemirrorAppTheme";

describe("Shellular CodeMirror themes", () => {
	it("creates an app and syntax extension for every registered theme", async () => {
		for (const option of themeOptions) {
			const theme = await themes.get(option.id);
			expect(createCodeMirrorAppTheme(theme)).toBeTruthy();
		}
	});
});
