import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension, Prec } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import type Theme from "classes/theme";
import { EditorView } from "codemirror";
import { withColorAlpha } from "./monacoColor";

export function createCodeMirrorAppTheme(theme: Theme): Extension {
	const dark = theme.type !== "light";
	const syntax = theme.syntaxTheme;
	const viewTheme = EditorView.theme(
		{
			"&": {
				backgroundColor: theme.primary,
				backgroundImage: "none",
				color: theme.primaryText,
			},
			".cm-scroller": {
				backgroundColor: theme.primary,
				color: theme.primaryText,
			},
			".cm-gutters, .cm-changeGutter": {
				backgroundColor: theme.secondary,
				borderColor: theme.cardBorder,
				color: theme.textMuted,
			},
			".cm-activeLine": { backgroundColor: theme.surfaceSoft },
			".cm-activeLineGutter": {
				backgroundColor: theme.surfaceSoft,
				color: theme.primaryText,
			},
			".cm-cursor, .cm-dropCursor": { borderLeftColor: theme.accent },
			".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
				{
					backgroundColor: `${withColorAlpha(
						theme.accent,
						dark ? 0.24 : 0.2,
					)} !important`,
				},
			".cm-panels, .cm-tooltip": {
				background: theme.popupBackground,
				borderColor: theme.popupBorderColor,
				color: theme.popupText,
			},
			".cm-textfield, .cm-panel.cm-search input": {
				backgroundColor: theme.input,
				borderColor: theme.cardBorder,
				color: theme.inputText,
			},
			".cm-button, .cm-panel.cm-search button": {
				backgroundColor: theme.surfaceSoft,
				borderColor: theme.cardBorder,
				color: theme.primaryText,
			},
			".cm-foldPlaceholder": {
				backgroundColor: theme.surfaceStrong,
				borderColor: theme.cardBorder,
				color: theme.accent,
			},
			".cm-mergeView": {
				backgroundColor: theme.primary,
				color: theme.primaryText,
			},
			".cm-mergeViewEditors": { borderColor: theme.cardBorder },
		},
		{ dark },
	);
	const highlight = HighlightStyle.define(
		[
			{
				tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
				color: syntax.comment,
				fontStyle: "italic",
			},
			{
				tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier],
				color: syntax.keyword,
			},
			{ tag: [t.operator, t.punctuation], color: syntax.operator },
			{ tag: [t.string, t.special(t.string), t.regexp], color: syntax.string },
			{ tag: [t.number, t.bool, t.null], color: syntax.number },
			{ tag: [t.propertyName, t.attributeName], color: syntax.property },
			{ tag: [t.className, t.typeName, t.namespace], color: syntax.type },
			{ tag: [t.tagName], color: syntax.tag },
			{
				tag: [t.function(t.variableName), t.function(t.propertyName)],
				color: syntax.function,
			},
			{
				tag: [t.constant(t.name), t.standard(t.name)],
				color: syntax.constant,
			},
			{
				tag: [t.variableName, t.definition(t.variableName)],
				color: syntax.variable,
			},
			{
				tag: [t.invalid],
				color: theme.danger,
				textDecoration: "underline wavy",
			},
		],
		{ themeType: dark ? "dark" : "light" },
	);
	return Prec.high([viewTheme, syntaxHighlighting(highlight)]);
}
