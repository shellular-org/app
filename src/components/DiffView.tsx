import "./DiffView.scss";
import type {
	DiffLineAnnotation,
	FileContents,
	SelectedLineRange,
} from "@pierre/diffs";
import { MultiFileDiff } from "@pierre/diffs/react";
import { registerShellularDiffThemes } from "lib/diffsTheme";
import {
	DEFAULT_EDITOR_SETTINGS,
	type EditorSettings,
	getFontFamilyStack,
	loadSettings,
	SETTINGS_CHANGED_EVENT,
} from "lib/settings";
import { useEffect, useMemo, useState } from "react";
import themes from "themes";

// The diff renderer references custom Shiki themes that must be registered with
// @pierre/diffs before first render. This is idempotent, and lives here so every
// DiffView consumer is covered without depending on any feature module.
registerShellularDiffThemes();

/**
 * Renders a unified, syntax-highlighted diff between two file versions using
 * @pierre/diffs. This is feature-agnostic — it knows nothing about agents,
 * commits, or where the texts come from. Wrap it for feature-specific chrome.
 */
export default function DiffView<LAnnotation = undefined>({
	path,
	oldText,
	newText,
	className,
	lineAnnotations,
	selectedLines,
	renderAnnotation,
	onLineSelectionEnd,
}: {
	path: string;
	oldText: string;
	newText: string;
	className?: string;
	lineAnnotations?: DiffLineAnnotation<LAnnotation>[];
	selectedLines?: SelectedLineRange | null;
	renderAnnotation?: (
		annotation: DiffLineAnnotation<LAnnotation>,
	) => React.ReactNode;
	onLineSelectionEnd?: (range: SelectedLineRange | null) => void;
}) {
	const oldFile = useMemo<FileContents>(
		() => ({
			name: path,
			contents: oldText,
			cacheKey: `${path}:old:${oldText.length}`,
		}),
		[path, oldText],
	);
	const newFile = useMemo<FileContents>(
		() => ({
			name: path,
			contents: newText,
			cacheKey: `${path}:new:${newText.length}`,
		}),
		[path, newText],
	);
	const [themeType, setThemeType] = useState<"light" | "dark">(() =>
		themes.current?.type === "light" ? "light" : "dark",
	);
	const [editorSettings, setEditorSettings] = useState<EditorSettings>(
		DEFAULT_EDITOR_SETTINGS,
	);
	const diffStyle = useMemo(
		() =>
			({
				"--diffs-font-family": getFontFamilyStack(editorSettings.fontFamily),
				"--diffs-font-size": `${Math.max(11, editorSettings.fontSize - 2)}px`,
				"--diffs-line-height": `${Math.round(editorSettings.fontSize * 1.38)}px`,
				"--diffs-tab-size": String(editorSettings.tabSize),
			}) as React.CSSProperties,
		[editorSettings],
	);

	useEffect(
		() =>
			themes.subscribe((theme) => {
				setThemeType(theme.type === "light" ? "light" : "dark");
			}),
		[],
	);

	useEffect(() => {
		let mounted = true;
		loadSettings().then((settings) => {
			if (mounted) setEditorSettings(settings.editor);
		});

		const onSettingsChanged = (event: Event) => {
			const settings = (event as CustomEvent<{ editor?: EditorSettings }>)
				.detail;
			if (settings?.editor) setEditorSettings(settings.editor);
		};

		window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
		return () => {
			mounted = false;
			window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
		};
	}, []);

	return (
		<MultiFileDiff<LAnnotation>
			className={`diff-view${className ? ` ${className}` : ""}`}
			style={diffStyle}
			oldFile={oldFile}
			newFile={newFile}
			lineAnnotations={lineAnnotations}
			selectedLines={selectedLines}
			renderAnnotation={renderAnnotation}
			disableWorkerPool
			options={{
				theme: {
					light: "shellular-champagne-light",
					dark: "shellular-champagne-noir",
				},
				themeType,
				diffStyle: "unified",
				diffIndicators: "bars",
				overflow: editorSettings.wordWrap ? "wrap" : "scroll",
				// Review selection is anchored in the gutter, so line numbers must stay
				// available even when the general editor preference hides them.
				disableLineNumbers: onLineSelectionEnd
					? false
					: !editorSettings.lineNumbers,
				expandUnchanged: false,
				hunkSeparators: "line-info",
				collapsedContextThreshold: 10,
				expansionLineCount: 12,
				lineDiffType: "char",
				maxLineDiffLength: 2400,
				disableFileHeader: true,
				enableLineSelection: Boolean(onLineSelectionEnd),
				controlledSelection: Boolean(onLineSelectionEnd),
				onLineSelectionEnd,
			}}
		/>
	);
}
