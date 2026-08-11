import { registerCustomTheme } from "@pierre/diffs";
import type Theme from "classes/theme";
import themes from "themes";
import { toThemeId } from "themes/id";
import { withColorAlpha } from "./monacoColor";

let registered = false;

export function diffThemeName(theme: Pick<Theme, "name">): string {
	return `shellular-${toThemeId(theme.name)}`;
}

export function diffThemeNameFromId(id: string): string {
	return `shellular-${toThemeId(id)}`;
}

export function createDiffTheme(theme: Theme) {
	const syntax = theme.syntaxTheme;
	return {
		name: diffThemeName(theme),
		type: theme.type === "light" ? ("light" as const) : ("dark" as const),
		colors: {
			"editor.background": theme.primary,
			"editor.foreground": theme.primaryText,
			"editor.selectionBackground": withColorAlpha(theme.accent, 0.24),
			"editor.lineHighlightBackground": theme.surfaceSoft,
			"editorLineNumber.foreground": theme.textMuted,
			"editorCursor.foreground": theme.accent,
		},
		tokenColors: [
			{
				scope: ["comment", "punctuation.definition.comment"],
				settings: { foreground: syntax.comment, fontStyle: "italic" },
			},
			{
				scope: ["keyword", "storage", "storage.type", "constant.language"],
				settings: { foreground: syntax.keyword },
			},
			{
				scope: [
					"keyword.operator",
					"punctuation.separator",
					"punctuation.terminator",
				],
				settings: { foreground: syntax.operator },
			},
			{
				scope: ["string", "string.quoted", "constant.character"],
				settings: { foreground: syntax.string },
			},
			{
				scope: [
					"constant.numeric",
					"constant.language.boolean",
					"constant.language.null",
				],
				settings: { foreground: syntax.number },
			},
			{
				scope: [
					"entity.name.function",
					"support.function",
					"variable.function",
				],
				settings: { foreground: syntax.function },
			},
			{
				scope: [
					"entity.name.type",
					"entity.name.class",
					"support.type",
					"support.class",
				],
				settings: { foreground: syntax.type },
			},
			{
				scope: ["entity.name.tag", "support.type.property-name"],
				settings: { foreground: syntax.tag },
			},
			{
				scope: ["entity.other.attribute-name", "variable.other.property"],
				settings: { foreground: syntax.property },
			},
			{
				scope: ["variable", "identifier"],
				settings: { foreground: syntax.variable },
			},
			{
				scope: ["regexp", "constant.character.escape"],
				settings: { foreground: syntax.regexp },
			},
			{
				scope: ["markup.heading", "markup.bold"],
				settings: { foreground: syntax.keyword, fontStyle: "bold" },
			},
			{
				scope: ["markup.italic", "markup.quote"],
				settings: { foreground: syntax.variable, fontStyle: "italic" },
			},
			{
				scope: ["invalid", "invalid.illegal"],
				settings: { foreground: theme.danger, fontStyle: "underline" },
			},
		],
	};
}

export function registerShellularDiffThemes() {
	if (registered) return;
	registered = true;

	for (const option of themes.options) {
		registerCustomTheme(diffThemeNameFromId(option.id), async () =>
			createDiffTheme(await themes.get(option.id)),
		);
	}
}
