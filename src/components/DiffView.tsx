import "./DiffView.scss";
import type { FileContents } from "@pierre/diffs";
import { MultiFileDiff } from "@pierre/diffs/react";
import {
	diffThemeName,
	diffThemeNameFromId,
	registerShellularDiffThemes,
} from "lib/diffsTheme";
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
export default function DiffView({
	path,
	oldText,
	newText,
	className,
}: {
	path: string;
	oldText: string;
	newText: string;
	className?: string;
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
	const [activeTheme, setActiveTheme] = useState(() => ({
		name: themes.current
			? diffThemeName(themes.current)
			: diffThemeNameFromId("dark"),
		type:
			themes.current?.type === "light" ? ("light" as const) : ("dark" as const),
	}));
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
				setActiveTheme({
					name: diffThemeName(theme),
					type: theme.type === "light" ? "light" : "dark",
				});
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
		<MultiFileDiff
			className={`diff-view${className ? ` ${className}` : ""}`}
			style={diffStyle}
			oldFile={oldFile}
			newFile={newFile}
			disableWorkerPool
			options={{
				theme: {
					light: activeTheme.name,
					dark: activeTheme.name,
				},
				themeType: activeTheme.type,
				diffStyle: "unified",
				diffIndicators: "bars",
				overflow: editorSettings.wordWrap ? "wrap" : "scroll",
				disableLineNumbers: !editorSettings.lineNumbers,
				expandUnchanged: false,
				hunkSeparators: "line-info",
				collapsedContextThreshold: 10,
				expansionLineCount: 12,
				lineDiffType: "char",
				maxLineDiffLength: 2400,
				disableFileHeader: true,
			}}
		/>
	);
}
