import dialog from "bridge/dialog";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { showContextMenuForEvent } from "context-menu/service";
import { observeElementResize } from "lib/elementResize";
import { acquireMonacoModel, isMonacoModelDirty } from "lib/monacoModels";
import { loadMonaco, resolveMonacoLanguage } from "lib/monacoRuntime";
import {
	type AppSettings,
	DEFAULT_EDITOR_SETTINGS,
	type EditorSettings,
	getFontFamilyStack,
	loadSettings,
	SETTINGS_CHANGED_EVENT,
} from "lib/settings";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShellular } from "state";
import { getHostInfo } from "state/connection";
import { GIT_WORKTREE_CHANGED_EVENT } from "state/filesystem";
import {
	notifyWorkbenchCommandStateChanged,
	openWorkbenchSurface,
	registerWorkbenchCloseGuard,
	registerWorkbenchCommandHandlers,
	updateWorkbenchSurface,
} from "workbench/store";
import { createEditorSurface } from "workbench/surfaces";
import type { EditorComparison } from "workbench/types";
import type { EditorPageProps } from "./types";
import "./style.scss";

type LoadedDocument =
	| { kind: "edit"; content: string }
	| { kind: "diff"; original: string; modified: string };

function normalizedComparison(
	comparison: EditorComparison | undefined,
	gitComparison: EditorPageProps["gitComparison"],
): EditorComparison | undefined {
	return (
		comparison ??
		(gitComparison
			? {
					kind: "working-tree",
					projectPath: gitComparison.projectPath,
					relativePath: gitComparison.relativePath,
					target: gitComparison.target,
				}
			: undefined)
	);
}

function joinPath(root: string, relative: string) {
	return `${root.replace(/\/$/, "")}/${relative.replace(/^\//, "")}`;
}

function modelUri(
	monaco: typeof Monaco,
	hostId: string,
	path: string,
	role: string,
) {
	const normalized = path.split("\\").join("/");
	return monaco.Uri.from({
		scheme: role === "file" ? "shellular-file" : "shellular-diff",
		authority: hostId || "host",
		path: normalized.startsWith("/") ? normalized : `/${normalized}`,
		query: role === "file" ? undefined : `role=${encodeURIComponent(role)}`,
	});
}

function comparisonModelKey(comparison: EditorComparison | undefined) {
	if (!comparison) return "comparison";
	switch (comparison.kind) {
		case "working-tree":
			return `working-tree:${comparison.projectPath}:${comparison.target}:${comparison.relativePath}`;
		case "commit":
			return `commit:${comparison.projectPath}:${comparison.hash}:${comparison.relativePath}`;
		case "inline":
			return `inline:${comparison.workspacePath}:${comparison.sourceId}:${comparison.relativePath}`;
	}
}

function comparisonFilePath(comparison: EditorComparison) {
	if (comparison.relativePath.startsWith("/")) return comparison.relativePath;
	const root =
		comparison.kind === "inline"
			? comparison.workspacePath
			: comparison.projectPath;
	return joinPath(root, comparison.relativePath);
}

function editorOptions(
	settings: EditorSettings,
	readOnly: boolean,
): Monaco.editor.IStandaloneEditorConstructionOptions {
	return {
		automaticLayout: false,
		readOnly,
		fontSize: settings.fontSize,
		fontFamily: getFontFamilyStack(settings.fontFamily),
		fontLigatures: true,
		wordWrap: settings.wordWrap ? "on" : "off",
		lineNumbers: settings.lineNumbers ? "on" : "off",
		minimap: { enabled: settings.minimap },
		stickyScroll: { enabled: settings.stickyScroll },
		folding: true,
		glyphMargin: true,
		bracketPairColorization: { enabled: true },
		guides: { bracketPairs: true, indentation: true },
		largeFileOptimizations: true,
		contextmenu: false,
		multiCursorModifier: "alt",
		suggest: { showWords: true },
		padding: { top: 8, bottom: 12 },
		scrollBeyondLastLine: false,
	};
}

export default function MonacoEditorPage(props: EditorPageProps) {
	const {
		filePath,
		initialLine,
		initialColumn,
		pageId,
		gitStatus,
		readOnly = false,
	} = props;
	const comparison = useMemo(
		() => normalizedComparison(props.comparison, props.gitComparison),
		[props.comparison, props.gitComparison],
	);
	const { readFile, runGitOperation, getCommitFileDiff, writeFile, projects } =
		useShellular();
	const hostId = getHostInfo()?.id ?? "local";
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(
		null,
	);
	const commandEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
		null,
	);
	const modelRef = useRef<Monaco.editor.ITextModel | null>(null);
	const diffModelsRef = useRef<Monaco.editor.ITextModel[]>([]);
	const requestRef = useRef(0);
	const savedVersionRef = useRef(0);
	const settingsRef = useRef(DEFAULT_EDITOR_SETTINGS);
	const [document, setDocument] = useState<LoadedDocument | null>(null);
	const [settings, setSettings] = useState<EditorSettings>(
		DEFAULT_EDITOR_SETTINGS,
	);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [binary, setBinary] = useState(false);
	const [refresh, setRefresh] = useState(0);
	const fileName = filePath.split("/").pop() || filePath;
	settingsRef.current = settings;

	useEffect(() => {
		let mounted = true;
		void loadSettings().then((value) => mounted && setSettings(value.editor));
		const onSettings = (event: Event) => {
			const value = (event as CustomEvent<AppSettings>).detail;
			if (value?.editor) setSettings(value.editor);
		};
		window.addEventListener(SETTINGS_CHANGED_EVENT, onSettings);
		return () => {
			mounted = false;
			window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettings);
		};
	}, []);

	useEffect(() => {
		if (comparison?.kind !== "working-tree") return;
		const reload = () => setRefresh((value) => value + 1);
		window.addEventListener(GIT_WORKTREE_CHANGED_EVENT, reload);
		return () => window.removeEventListener(GIT_WORKTREE_CHANGED_EVENT, reload);
	}, [comparison]);

	useEffect(() => {
		void refresh;
		const request = ++requestRef.current;
		setLoading(true);
		setError(null);
		setBinary(false);
		const load = async (): Promise<LoadedDocument> => {
			if (!comparison)
				return { kind: "edit", content: await readFile(filePath) };
			if (comparison.kind === "inline") {
				return {
					kind: "diff",
					original: comparison.oldText,
					modified: comparison.newText,
				};
			}
			if (comparison.kind === "commit") {
				const result = await getCommitFileDiff(
					comparison.projectPath,
					comparison.hash,
					comparison.relativePath,
				);
				if (result.binary) throw new Error("BINARY_DIFF");
				return {
					kind: "diff",
					original: result.oldText,
					modified: result.newText,
				};
			}
			const result = await runGitOperation(comparison.projectPath, "diff", {
				file: comparison.relativePath,
				diffTarget: comparison.target,
			});
			if (!result.diff) throw new Error("No diff data received");
			if (result.diff.binary) throw new Error("BINARY_DIFF");
			return {
				kind: "diff",
				original: result.diff.oldText,
				modified: result.diff.newText,
			};
		};
		void load()
			.then((value) => {
				if (requestRef.current !== request) return;
				setDocument(value);
				setDirty(false);
			})
			.catch((reason: Error) => {
				if (requestRef.current !== request) return;
				if (
					reason.message === "BINARY_DIFF" ||
					reason.message.includes("binary file")
				)
					setBinary(true);
				else setError(reason.message || "Failed to load file");
				setDocument(null);
			})
			.finally(() => {
				if (requestRef.current === request) setLoading(false);
			});
		return () => {
			requestRef.current += 1;
		};
	}, [
		comparison,
		filePath,
		getCommitFileDiff,
		readFile,
		refresh,
		runGitOperation,
	]);

	useEffect(() => {
		if (!containerRef.current || !document) return;
		let cancelled = false;
		let cleanup = () => {};
		void loadMonaco()
			.then((monaco) => {
				if (cancelled || !containerRef.current) return;
				const container = containerRef.current;
				const language = resolveMonacoLanguage(monaco, filePath);
				const initialSettings = settingsRef.current;
				const baseOptions = editorOptions(
					initialSettings,
					readOnly || document.kind === "diff",
				);
				if (document.kind === "edit") {
					const acquired = acquireMonacoModel(
						monaco,
						modelUri(monaco, hostId, filePath, "file"),
						document.content,
						language,
					);
					acquired.model.updateOptions({ tabSize: initialSettings.tabSize });
					const editor = monaco.editor.create(container, {
						...baseOptions,
						model: acquired.model,
					});
					editorRef.current = editor;
					commandEditorRef.current = editor;
					modelRef.current = acquired.model;
					savedVersionRef.current = acquired.model.getAlternativeVersionId();
					const changed = acquired.model.onDidChangeContent(() =>
						setDirty(
							isMonacoModelDirty(
								acquired.model.getAlternativeVersionId(),
								savedVersionRef.current,
							),
						),
					);
					editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
						window.dispatchEvent(
							new CustomEvent(`shellular:save:${pageId ?? filePath}`),
						),
					);
					if (initialLine) {
						editor.setPosition({
							lineNumber: Math.max(1, initialLine),
							column: Math.max(1, initialColumn ?? 1),
						});
						editor.revealLineInCenter(initialLine);
						editor.focus();
					}
					const stopObservingSize = observeElementResize(container, {
						onFrame: (size) => editor.layout(size),
						onSettled: (size) => editor.layout(size),
						delivery: "pre-paint",
					});
					cleanup = () => {
						stopObservingSize();
						changed.dispose();
						editor.dispose();
						acquired.release();
					};
				} else {
					const role = comparisonModelKey(comparison);
					const original = acquireMonacoModel(
						monaco,
						modelUri(monaco, hostId, filePath, `${role}:original`),
						document.original,
						language,
					);
					const modified = acquireMonacoModel(
						monaco,
						modelUri(monaco, hostId, filePath, `${role}:modified`),
						document.modified,
						language,
					);
					original.model.updateOptions({ tabSize: initialSettings.tabSize });
					modified.model.updateOptions({ tabSize: initialSettings.tabSize });
					const diff = monaco.editor.createDiffEditor(container, {
						...baseOptions,
						readOnly: true,
						originalEditable: false,
						renderSideBySide: true,
						useInlineViewWhenSpaceIsLimited: true,
						hideUnchangedRegions: {
							enabled: true,
							minimumLineCount: 3,
							contextLineCount: 3,
							revealLineCount: 10,
						},
					});
					diff.setModel({ original: original.model, modified: modified.model });
					diffEditorRef.current = diff;
					commandEditorRef.current = diff.getModifiedEditor();
					diffModelsRef.current = [original.model, modified.model];
					const originalFocused = diff
						.getOriginalEditor()
						.onDidFocusEditorText(() => {
							commandEditorRef.current = diff.getOriginalEditor();
						});
					const modifiedFocused = diff
						.getModifiedEditor()
						.onDidFocusEditorText(() => {
							commandEditorRef.current = diff.getModifiedEditor();
						});
					const stopObservingSize = observeElementResize(container, {
						onFrame: (size) => diff.layout(size),
						onSettled: (size) => diff.layout(size),
						delivery: "pre-paint",
					});
					cleanup = () => {
						stopObservingSize();
						originalFocused.dispose();
						modifiedFocused.dispose();
						diff.dispose();
						original.release();
						modified.release();
					};
				}
				notifyWorkbenchCommandStateChanged();
			})
			.catch((reason: Error) =>
				setError(reason.message || "Monaco could not start"),
			);
		return () => {
			cancelled = true;
			editorRef.current = null;
			diffEditorRef.current = null;
			commandEditorRef.current = null;
			modelRef.current = null;
			diffModelsRef.current = [];
			cleanup();
			notifyWorkbenchCommandStateChanged();
		};
	}, [
		comparison,
		document,
		filePath,
		hostId,
		initialColumn,
		initialLine,
		pageId,
		readOnly,
	]);

	useEffect(() => {
		const options = editorOptions(settings, readOnly || Boolean(comparison));
		modelRef.current?.updateOptions({ tabSize: settings.tabSize });
		for (const model of diffModelsRef.current) {
			model.updateOptions({ tabSize: settings.tabSize });
		}
		editorRef.current?.updateOptions(options);
		diffEditorRef.current?.updateOptions(options);
	}, [comparison, readOnly, settings]);

	const save = useCallback(async () => {
		const model = modelRef.current;
		if (!model || comparison || readOnly || saving) return;
		setSaving(true);
		setError(null);
		try {
			await writeFile(filePath, model.getValue());
			savedVersionRef.current = model.getAlternativeVersionId();
			setDirty(false);
		} catch (reason) {
			setError((reason as Error).message || "Failed to save");
		} finally {
			setSaving(false);
		}
	}, [comparison, filePath, readOnly, saving, writeFile]);

	useEffect(() => {
		const id = pageId ?? filePath;
		const listener = () => void save();
		window.addEventListener(`shellular:save:${id}`, listener);
		const editor = () => commandEditorRef.current;
		const editable = () =>
			Boolean(editorRef.current && !comparison && !readOnly);
		const trigger = (command: string) =>
			editor()?.trigger("shellular-menu", command, null);
		const unregisterCommands = registerWorkbenchCommandHandlers(id, {
			save: {
				run: save,
				enabled: () => editable() && dirty && !saving,
			},
			undo: {
				run: () => trigger("undo"),
				enabled: editable,
			},
			redo: {
				run: () => trigger("redo"),
				enabled: editable,
			},
			cut: {
				run: () => trigger("editor.action.clipboardCutAction"),
				enabled: editable,
			},
			copy: {
				run: () => trigger("editor.action.clipboardCopyAction"),
				enabled: () => Boolean(editor()),
			},
			paste: {
				run: () => trigger("editor.action.clipboardPasteAction"),
				enabled: editable,
			},
			"select-all": {
				run: () => trigger("editor.action.selectAll"),
				enabled: () => Boolean(editor()),
			},
		});
		return () => {
			window.removeEventListener(`shellular:save:${id}`, listener);
			unregisterCommands();
		};
	}, [comparison, dirty, filePath, pageId, readOnly, save, saving]);

	useEffect(() => {
		if (!pageId) return;
		updateWorkbenchSurface(pageId, { dirty });
		return registerWorkbenchCloseGuard(
			pageId,
			async (context) =>
				!dirty ||
				context?.destructiveConfirmed === true ||
				dialog.confirm("Discard unsaved changes?", "Unsaved Changes"),
		);
	}, [dirty, pageId]);

	useEffect(() => {
		if (!dirty) return;
		const guard = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", guard);
		return () => window.removeEventListener("beforeunload", guard);
	}, [dirty]);

	const project = projects
		.filter(
			(candidate) =>
				filePath === candidate.path ||
				filePath.startsWith(`${candidate.path.replace(/\/$/, "")}/`),
		)
		.sort((a, b) => b.path.length - a.path.length)[0];
	const breadcrumb = project
		? `${project.name} / ${filePath.slice(project.path.length).replace(/^\//, "")}`
		: filePath;
	const canOpenComparisonFile =
		comparison &&
		!(comparison.kind === "working-tree" && gitStatus === "deleted");
	const openFile = canOpenComparisonFile && (
		<button
			type="button"
			className="page-header-action"
			aria-label="Open file"
			title="Open file"
			onClick={() => {
				openWorkbenchSurface(
					createEditorSurface({ filePath: comparisonFilePath(comparison) }),
				);
			}}
		>
			<span className="icon-file-text" aria-hidden="true" />
		</button>
	);
	const editorContextTarget = () => {
		const editor = commandEditorRef.current;
		const editable = Boolean(editorRef.current && !comparison && !readOnly);
		const trigger = (command: string) =>
			editor?.trigger("shellular-context-menu", command, null);
		const action = (id: string) => editor?.getAction(id);
		return {
			handlers: {
				"edit.undo": { run: () => trigger("undo"), enabled: editable },
				"edit.redo": { run: () => trigger("redo"), enabled: editable },
				"edit.cut": {
					run: () => trigger("editor.action.clipboardCutAction"),
					enabled: editable,
				},
				"edit.copy": {
					run: () => trigger("editor.action.clipboardCopyAction"),
					enabled: Boolean(editor),
				},
				"edit.paste": {
					run: () => trigger("editor.action.clipboardPasteAction"),
					enabled: editable,
				},
				"edit.selectAll": {
					run: () => trigger("editor.action.selectAll"),
					enabled: Boolean(editor),
				},
				"editor.definition": monacoAction(
					action,
					"editor.action.revealDefinition",
				),
				"editor.peekDefinition": monacoAction(
					action,
					"editor.action.peekDefinition",
				),
				"editor.references": monacoAction(
					action,
					"editor.action.goToReferences",
				),
				"editor.renameSymbol": monacoAction(
					action,
					"editor.action.rename",
					editable,
				),
				"editor.formatDocument": monacoAction(
					action,
					"editor.action.formatDocument",
					editable,
				),
				"editor.openFile": {
					run: () => {
						if (!comparison) return;
						openWorkbenchSurface(
							createEditorSurface({ filePath: comparisonFilePath(comparison) }),
						);
					},
					enabled: Boolean(canOpenComparisonFile),
					visible: Boolean(comparison),
				},
			},
		};
	};

	return (
		<Page
			title={fileName}
			className="editor-page monaco-editor-page"
			titleSlot={dirty ? <span className="editor-dirty-dot" /> : undefined}
			rightSlot={comparison ? openFile : undefined}
			noBottomSafeArea
		>
			{error && (
				<div className="editor-error flex items-center justify-between gap-3">
					<span>{error}</span>
					<button
						type="button"
						className="shrink-0 rounded border border-danger/30 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
						onClick={() => setRefresh((value) => value + 1)}
					>
						Retry
					</button>
				</div>
			)}
			{loading && <EmptyState message="Loading file…" mascot="loading" />}
			{!loading && binary && (
				<EmptyState
					message="Binary file — diff not available"
					mascot="thinking"
				/>
			)}
			{!loading && !binary && document && (
				<>
					<div
						className="h-7 shrink-0 truncate border-b border-line-soft bg-secondary/60 px-3 text-[11px] leading-7 text-secondary-text"
						title={filePath}
					>
						{breadcrumb}
					</div>
					<div
						ref={containerRef}
						className="monaco-editor-host min-h-0 w-full flex-1 overflow-hidden"
						onContextMenu={(event) => {
							if (!process.env.IS_DESKTOP_UI) return;
							void showContextMenuForEvent(event, {
								menuId: comparison ? "editor-diff" : "editor",
								target: editorContextTarget(),
							});
						}}
					/>
				</>
			)}
		</Page>
	);
}

function monacoAction(
	resolve: (id: string) => Monaco.editor.IEditorAction | null | undefined,
	id: string,
	additionalEnabled = true,
) {
	return {
		run: () => resolve(id)?.run(),
		enabled: () => Boolean(additionalEnabled && resolve(id)?.isSupported()),
		visible: () => Boolean(resolve(id)?.isSupported()),
	};
}
