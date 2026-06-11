import { registerCustomTheme } from "@pierre/diffs";

let registered = false;

const shellularDarkTheme = {
	name: "shellular-champagne-noir",
	type: "dark" as const,
	colors: {
		"editor.background": "#0f1013",
		"editor.foreground": "#f6f2e9",
		"editor.selectionBackground": "#d6c2a13d",
		"editor.lineHighlightBackground": "#f5f1e808",
		"editorLineNumber.foreground": "#80786d",
		"editorCursor.foreground": "#d6c2a1",
	},
	tokenColors: [
		{
			scope: ["comment", "punctuation.definition.comment"],
			settings: { foreground: "#80786d", fontStyle: "italic" },
		},
		{
			scope: ["keyword", "storage", "storage.type", "constant.language"],
			settings: { foreground: "#d6c2a1", fontStyle: "bold" },
		},
		{
			scope: [
				"keyword.operator",
				"punctuation.separator",
				"punctuation.terminator",
			],
			settings: { foreground: "#8fb7b3" },
		},
		{
			scope: ["string", "string.quoted", "constant.character"],
			settings: { foreground: "#91c58a" },
		},
		{
			scope: [
				"constant.numeric",
				"constant.language.boolean",
				"constant.language.null",
			],
			settings: { foreground: "#e8d8bc" },
		},
		{
			scope: ["entity.name.function", "support.function", "variable.function"],
			settings: { foreground: "#a7c1d9" },
		},
		{
			scope: [
				"entity.name.type",
				"entity.name.class",
				"support.type",
				"support.class",
			],
			settings: { foreground: "#e8d8bc" },
		},
		{
			scope: ["entity.name.tag", "support.type.property-name"],
			settings: { foreground: "#d6c2a1" },
		},
		{
			scope: ["entity.other.attribute-name", "variable.other.property"],
			settings: { foreground: "#ddd4c6" },
		},
		{
			scope: ["variable", "identifier"],
			settings: { foreground: "#ddd4c6" },
		},
		{
			scope: ["regexp", "constant.character.escape"],
			settings: { foreground: "#8fb7b3" },
		},
		{
			scope: ["markup.heading", "markup.bold"],
			settings: { foreground: "#d6c2a1", fontStyle: "bold" },
		},
		{
			scope: ["markup.italic", "markup.quote"],
			settings: { foreground: "#ddd4c6", fontStyle: "italic" },
		},
		{
			scope: ["invalid", "invalid.illegal"],
			settings: { foreground: "#c96b5c", fontStyle: "underline" },
		},
	],
};

const shellularLightTheme = {
	name: "shellular-champagne-light",
	type: "light" as const,
	colors: {
		"editor.background": "#fffaf1",
		"editor.foreground": "#231f1a",
		"editor.selectionBackground": "#8a6f4d33",
		"editor.lineHighlightBackground": "#231f1a08",
		"editorLineNumber.foreground": "#8a8176",
		"editorCursor.foreground": "#8a6f4d",
	},
	tokenColors: [
		{
			scope: ["comment", "punctuation.definition.comment"],
			settings: { foreground: "#8a8176", fontStyle: "italic" },
		},
		{
			scope: ["keyword", "storage", "storage.type", "constant.language"],
			settings: { foreground: "#8a6f4d", fontStyle: "bold" },
		},
		{
			scope: [
				"keyword.operator",
				"punctuation.separator",
				"punctuation.terminator",
			],
			settings: { foreground: "#2f6f73" },
		},
		{
			scope: ["string", "string.quoted", "constant.character"],
			settings: { foreground: "#52785a" },
		},
		{
			scope: [
				"constant.numeric",
				"constant.language.boolean",
				"constant.language.null",
			],
			settings: { foreground: "#6f5738" },
		},
		{
			scope: ["entity.name.function", "support.function", "variable.function"],
			settings: { foreground: "#386f8f" },
		},
		{
			scope: [
				"entity.name.type",
				"entity.name.class",
				"support.type",
				"support.class",
			],
			settings: { foreground: "#6f5738" },
		},
		{
			scope: ["entity.name.tag", "support.type.property-name"],
			settings: { foreground: "#8a6f4d" },
		},
		{
			scope: [
				"entity.other.attribute-name",
				"variable.other.property",
				"variable",
			],
			settings: { foreground: "#4e463b" },
		},
		{
			scope: ["regexp", "constant.character.escape"],
			settings: { foreground: "#2f6f73" },
		},
		{
			scope: ["invalid", "invalid.illegal"],
			settings: { foreground: "#c04b3b", fontStyle: "underline" },
		},
	],
};

export function registerShellularDiffThemes() {
	if (registered) return;
	registered = true;
	registerCustomTheme("shellular-champagne-noir", () =>
		Promise.resolve(shellularDarkTheme),
	);
	registerCustomTheme("shellular-champagne-light", () =>
		Promise.resolve(shellularLightTheme),
	);
}
