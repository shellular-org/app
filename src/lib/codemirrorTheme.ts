import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension, Prec } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { EditorView } from "codemirror";

const palette = {
	background: "#0f1013",
	surface: "#16171c",
	surfaceStrong: "#1b1c22",
	surfaceSoft: "rgba(245, 241, 232, 0.045)",
	text: "#f6f2e9",
	textSoft: "#ddd4c6",
	muted: "#80786d",
	mutedSoft: "rgba(221, 212, 198, 0.48)",
	line: "rgba(214, 194, 161, 0.08)",
	lineStrong: "rgba(214, 194, 161, 0.16)",
	accent: "#d6c2a1",
	accentSoft: "rgba(214, 194, 161, 0.16)",
	accentSofter: "rgba(214, 194, 161, 0.08)",
	selection: "rgba(214, 194, 161, 0.24)",
	activeLine: "rgba(245, 241, 232, 0.032)",
	red: "#c96b5c",
	redSoft: "rgba(201, 107, 92, 0.16)",
	green: "#91c58a",
	greenSoft: "rgba(145, 197, 138, 0.15)",
	yellow: "#e8d8bc",
	blue: "#a7c1d9",
	cyan: "#8fb7b3",
	magenta: "#b29679",
};

const diffPalette = {
	insertedLine: "rgba(145, 197, 138, 0.12)",
	insertedLineStrong: "rgba(145, 197, 138, 0.18)",
	insertedText: "rgba(145, 197, 138, 0.2)",
	deletedLine: "rgba(201, 107, 92, 0.12)",
	deletedLineStrong: "rgba(201, 107, 92, 0.18)",
	deletedText: "rgba(201, 107, 92, 0.22)",
	changedLine: "rgba(214, 194, 161, 0.07)",
	changedText: "rgba(214, 194, 161, 0.18)",
};

export const champagneNoirEditorTheme = EditorView.theme(
	{
		"&": {
			backgroundColor: palette.background,
			backgroundImage:
				"linear-gradient(180deg, rgba(27, 28, 34, 0.42) 0%, rgba(15, 16, 19, 0) 30%)",
			boxShadow:
				"inset 0 1px 0 rgba(255, 249, 240, 0.03), inset 0 -1px 0 rgba(0, 0, 0, 0.35)",
			color: palette.text,
			height: "100%",
		},
		"&.cm-focused": {
			outline: "none",
		},
		".cm-scroller": {
			backgroundColor: palette.background,
			color: palette.text,
			lineHeight: "1.38",
			letterSpacing: "0.002em",
			fontVariantNumeric: "tabular-nums",
		},
		".cm-content": {
			caretColor: palette.accent,
			padding: "8px 0 14px",
		},
		".cm-line": {
			padding: "0 14px 0 6px",
		},
		".cm-cursor, .cm-dropCursor": {
			borderLeftColor: palette.accent,
		},
		".cm-cursor": {
			borderLeftWidth: "2px",
		},
		".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
			{
				backgroundColor: `${palette.selection} !important`,
			},
		".cm-gutters": {
			backgroundColor: palette.surface,
			color: palette.muted,
			boxShadow: "inset -1px 0 0 rgba(0, 0, 0, 0.3)",
		},
		".cm-gutter": {
			backgroundColor: "transparent",
		},
		".cm-gutterElement": {
			padding: "0 8px 0 10px",
		},
		".cm-lineNumbers .cm-gutterElement": {
			color: palette.muted,
			minWidth: "26px",
			textAlign: "right",
		},
		".cm-foldGutter": {
			width: "13px",
		},
		".cm-foldGutter .cm-gutterElement": {
			padding: "0 3px 0 2px",
			color: palette.mutedSoft,
		},
		".cm-activeLine": {
			backgroundColor: palette.activeLine,
		},
		".cm-activeLineGutter": {
			backgroundColor: "rgba(214, 194, 161, 0.035)",
			color: palette.mutedSoft,
		},
		".cm-foldPlaceholder": {
			backgroundColor: palette.surfaceStrong,
			border: `1px solid ${palette.lineStrong}`,
			borderRadius: "7px",
			color: palette.accent,
			padding: "0 6px",
		},
		".cm-matchingBracket": {
			backgroundColor: palette.accentSoft,
			boxShadow: `inset 0 0 0 1px ${palette.lineStrong}`,
			color: palette.yellow,
		},
		".cm-nonmatchingBracket": {
			backgroundColor: palette.redSoft,
			color: palette.red,
		},
		".cm-specialChar": {
			color: palette.magenta,
		},
		".cm-placeholder": {
			color: palette.mutedSoft,
		},
		".cm-selectionMatch": {
			backgroundColor: palette.accentSofter,
			boxShadow: `inset 0 0 0 1px ${palette.line}`,
		},
		".cm-searchMatch": {
			backgroundColor: "rgba(232, 216, 188, 0.22)",
			outline: "1px solid rgba(232, 216, 188, 0.38)",
		},
		".cm-searchMatch-selected": {
			backgroundColor: palette.selection,
			outline: `1px solid ${palette.accent}`,
		},
		".cm-panels": {
			backgroundColor: "rgba(22, 23, 28, 0.88)",
			backdropFilter: "blur(8px)",
			borderColor: palette.lineStrong,
			boxShadow:
				"inset 0 1px 0 rgba(255, 249, 240, 0.025), 0 8px 20px rgba(10, 8, 6, 0.18)",
			color: palette.textSoft,
		},
		".cm-panels-top": {
			borderBottom: `1px solid ${palette.lineStrong}`,
		},
		".cm-panels-bottom": {
			borderTop: `1px solid ${palette.lineStrong}`,
		},
		".cm-panel.cm-search": {
			alignItems: "center",
			display: "flex",
			flexWrap: "wrap",
			gap: "7px",
			padding: "9px 12px",
		},
		".cm-panel.cm-search label": {
			alignItems: "center",
			color: "rgba(221, 212, 198, 0.4)",
			display: "inline-flex",
			fontSize: "11px",
			gap: "4px",
		},
		".cm-textfield, .cm-panel.cm-search input": {
			backgroundColor: "rgba(13, 13, 15, 0.72)",
			border: `1px solid ${palette.line}`,
			borderRadius: "8px",
			color: palette.text,
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "1.2",
			minHeight: "30px",
			padding: "6px 10px",
			transition: "border-color 140ms ease, box-shadow 140ms ease",
		},
		".cm-textfield:focus, .cm-panel.cm-search input:focus": {
			borderColor: "rgba(214, 194, 161, 0.28)",
			boxShadow: `0 0 0 2px rgba(214, 194, 161, 0.06)`,
			outline: "none",
		},
		".cm-button, .cm-panel.cm-search button": {
			backgroundColor: "rgba(245, 241, 232, 0.03)",
			backgroundImage: "none",
			border: `1px solid ${palette.line}`,
			borderRadius: "8px",
			color: palette.mutedSoft,
			fontFamily: "inherit",
			fontSize: "11px",
			fontWeight: "550",
			letterSpacing: "0.01em",
			minHeight: "30px",
			padding: "6px 10px",
			transition:
				"background-color 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease",
		},
		".cm-button:hover, .cm-panel.cm-search button:hover": {
			backgroundColor: "rgba(245, 241, 232, 0.05)",
			borderColor: palette.lineStrong,
			color: palette.text,
		},
		".cm-button:active, .cm-panel.cm-search button:active": {
			backgroundColor: "rgba(245, 241, 232, 0.07)",
			color: palette.textSoft,
			transform: "translateY(1px)",
		},
		".cm-tooltip": {
			background:
				"linear-gradient(180deg, rgba(29, 30, 36, 0.98) 0%, rgba(22, 23, 28, 0.98) 100%)",
			backdropFilter: "blur(14px)",
			border: `1px solid ${palette.lineStrong}`,
			borderRadius: "14px",
			boxShadow:
				"0 18px 44px rgba(10, 8, 6, 0.48), inset 0 1px 0 rgba(255, 249, 240, 0.04)",
			color: palette.textSoft,
			overflow: "hidden",
		},
		".cm-tooltip-autocomplete": {
			"& > ul": {
				fontFamily: "inherit",
				maxHeight: "280px",
			},
			"& > ul > li": {
				color: palette.textSoft,
				padding: "6px 12px",
			},
			"& > ul > li[aria-selected]": {
				backgroundColor: palette.accentSoft,
				color: palette.text,
			},
		},
		".cm-completionMatchedText": {
			color: palette.accent,
			fontWeight: "600",
		},
		".cm-completionDetail": {
			color: palette.muted,
			fontSize: "11px",
			marginLeft: "12px",
		},
		".cm-completionIcon-function, .cm-completionIcon-method": {
			color: palette.blue,
		},
		".cm-completionIcon-class, .cm-completionIcon-interface": {
			color: palette.yellow,
		},
		".cm-completionIcon-variable, .cm-completionIcon-property": {
			color: palette.textSoft,
		},
		".cm-completionIcon-keyword": {
			color: palette.accent,
		},
		".cm-diagnostic": {
			borderLeft: `3px solid ${palette.lineStrong}`,
			padding: "6px 8px",
		},
		".cm-diagnostic-error": {
			backgroundColor: palette.redSoft,
			borderLeftColor: palette.red,
		},
		".cm-diagnostic-warning": {
			backgroundColor: "rgba(232, 216, 188, 0.12)",
			borderLeftColor: palette.yellow,
		},
		".cm-diagnostic-info": {
			backgroundColor: "rgba(167, 193, 217, 0.12)",
			borderLeftColor: palette.blue,
		},
		".cm-lintRange-error": {
			backgroundImage: `linear-gradient(45deg, transparent 65%, ${palette.red} 80%, transparent 90%)`,
		},
		".cm-lintRange-warning": {
			backgroundImage: `linear-gradient(45deg, transparent 65%, ${palette.yellow} 80%, transparent 90%)`,
		},
		".cm-mergeView": {
			backgroundColor: palette.background,
			color: palette.text,
		},
		".cm-mergeViewEditors": {
			borderColor: palette.line,
		},
		".cm-merge-revert": {
			color: palette.accent,
		},
	},
	{ dark: true },
);

export const champagneNoirMergeTheme = Prec.high(
	EditorView.theme(
		{
			"&.cm-focused": {
				outline: "none",
			},
			".cm-changeGutter": {
				width: "6px",
				padding: "0",
				backgroundColor: palette.background,
			},
			".cm-changeGutter .cm-gutterElement": {
				padding: "0",
			},
			".cm-changedLineGutter, .cm-inlineChangedLineGutter": {
				backgroundColor: palette.green,
			},
			".cm-deletedLineGutter": {
				backgroundColor: palette.red,
			},
			".cm-changedLine": {
				backgroundColor: diffPalette.changedLine,
			},
			".cm-inlineChangedLine, .cm-chunkInsertion": {
				backgroundColor: diffPalette.insertedLine,
			},
			".cm-deletedChunk, .cm-chunkDeletion": {
				backgroundColor: diffPalette.deletedLine,
			},
			".cm-deletedChunk": {
				paddingLeft: "0",
				borderTop: `1px solid ${diffPalette.deletedLineStrong}`,
				borderBottom: `1px solid ${diffPalette.deletedLineStrong}`,
			},
			".cm-deletedLine": {
				padding: "0 14px 0 6px",
			},
			".cm-changedText": {
				background: diffPalette.changedText,
				borderRadius: "2px",
			},
			".cm-inlineInserted, .cm-insertedLine": {
				background: diffPalette.insertedText,
				borderRadius: "2px",
				textDecoration: "none",
			},
			".cm-inlineDeleted, .cm-deletedText, .cm-deletedLine del": {
				background: diffPalette.deletedText,
				borderRadius: "2px",
				textDecoration: "none",
			},
			".cm-chunkUnchanged": {
				color: palette.mutedSoft,
			},
		},
		{ dark: true },
	),
);

export const champagneNoirHighlightStyle = HighlightStyle.define(
	[
		{
			tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
			color: palette.muted,
			fontStyle: "italic",
		},
		{
			tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword],
			color: palette.accent,
			fontWeight: "600",
		},
		{
			tag: [t.operatorKeyword, t.operator, t.compareOperator, t.logicOperator],
			color: palette.cyan,
		},
		{
			tag: [t.string, t.docString, t.character, t.attributeValue],
			color: palette.green,
		},
		{
			tag: [t.regexp, t.escape, t.special(t.string)],
			color: palette.cyan,
		},
		{
			tag: [t.number, t.integer, t.float, t.bool, t.atom, t.null],
			color: palette.yellow,
		},
		{
			tag: [t.variableName, t.self, t.local(t.variableName)],
			color: palette.textSoft,
		},
		{
			tag: [t.definition(t.variableName), t.function(t.variableName)],
			color: palette.blue,
		},
		{
			tag: [t.propertyName, t.attributeName],
			color: palette.textSoft,
		},
		{
			tag: [t.definition(t.propertyName), t.function(t.propertyName)],
			color: palette.blue,
		},
		{
			tag: [t.typeName, t.className, t.namespace, t.macroName, t.labelName],
			color: palette.yellow,
		},
		{
			tag: [t.tagName],
			color: palette.accent,
		},
		{
			tag: [t.punctuation, t.separator, t.bracket],
			color: palette.mutedSoft,
		},
		{
			tag: [t.meta, t.annotation, t.processingInstruction],
			color: palette.magenta,
		},
		{
			tag: [t.url, t.link],
			color: palette.blue,
			textDecoration: "underline",
			textUnderlineOffset: "2px",
		},
		{
			tag: [t.heading, t.heading1, t.heading2, t.heading3],
			color: palette.accent,
			fontWeight: "700",
		},
		{
			tag: [t.strong],
			color: palette.text,
			fontWeight: "700",
		},
		{
			tag: [t.emphasis],
			color: palette.text,
			fontStyle: "italic",
		},
		{
			tag: [t.monospace],
			color: palette.green,
		},
		{
			tag: [t.quote],
			color: palette.mutedSoft,
			fontStyle: "italic",
		},
		{
			tag: [t.inserted],
			color: palette.green,
		},
		{
			tag: [t.deleted],
			color: palette.red,
		},
		{
			tag: [t.changed],
			color: palette.yellow,
		},
		{
			tag: [t.invalid],
			color: palette.red,
			textDecoration: "underline wavy",
		},
	],
	{ themeType: "dark" },
);

export const champagneNoirCodeMirrorTheme: Extension = [
	champagneNoirEditorTheme,
	champagneNoirMergeTheme,
	syntaxHighlighting(champagneNoirHighlightStyle),
];
