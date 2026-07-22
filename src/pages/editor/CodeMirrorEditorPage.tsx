import "./style.scss";
import { closePage } from "App";
import type { MergeView } from "@codemirror/merge";
import { search } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import dialog from "bridge/dialog";
import type { EditorView } from "codemirror";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Mascot from "components/Mascot";
import Page from "components/Page";
import actionStack from "lib/actionStack";
import { createCodeMirrorAppTheme } from "lib/codemirrorAppTheme";
import { loadLanguageForFilename } from "lib/codemirrorLanguages";
import keyboard from "lib/keyboard";
import {
	type AppSettings,
	DEFAULT_EDITOR_SETTINGS,
	type EditorSettings,
	getFontFamilyStack,
	loadSettings,
	SETTINGS_CHANGED_EVENT,
} from "lib/settings";
import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type WheelEvent as ReactWheelEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useShellular } from "state";
import type { GitFileStatus } from "state/filesystem";
import { GIT_WORKTREE_CHANGED_EVENT } from "state/filesystem";
import themes from "themes";
import { registerWorkbenchCloseGuard } from "workbench/store";
import EditorFindReplace from "./EditorFindReplace";
import EditorToolbar from "./EditorToolbar";

type DiffMode = "unified" | "split";
type PreviewKind = "text" | "image" | "video" | "audio" | "pdf" | "binary";

interface FilePreviewType {
	kind: PreviewKind;
	mimeType?: string;
	label?: string;
	iconClass?: string;
}

export interface CodeMirrorEditorPageProps {
	filePath: string;
	gitStatus?: GitFileStatus;
	initialLine?: number;
	initialColumn?: number;
	readOnly?: boolean;
	pageId?: string;
	gitComparison?: {
		projectPath: string;
		relativePath: string;
		target: import("state").GitDiffTarget;
	};
}

function createHiddenSearchPanel(view: EditorView) {
	const dom = document.createElement("div");
	dom.className = "editor-find-hidden-panel";
	return {
		dom,
		mount() {
			view.dom.classList.add("editor-search-panel-hidden");
		},
		destroy() {
			view.dom.classList.remove("editor-search-panel-hidden");
		},
	};
}

function createEditorSettingsExtensions(
	EditorViewCtor: typeof EditorView,
	settings: EditorSettings,
): Extension[] {
	return [
		EditorViewCtor.theme({
			"&": {
				fontSize: `${settings.fontSize}px`,
				fontFamily: getFontFamilyStack(settings.fontFamily),
			},
			".cm-lineNumbers": {
				display: settings.lineNumbers ? "" : "none",
			},
			".cm-gutters": {
				display: settings.lineNumbers ? "" : "none",
			},
		}),
		settings.wordWrap ? EditorViewCtor.lineWrapping : [],
		EditorState.tabSize.of(settings.tabSize),
	];
}

function getFileExtension(path: string): string {
	const name = path.split("/").pop() || path;
	const dotIndex = name.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === name.length - 1) return "";
	return name.slice(dotIndex + 1).toLowerCase();
}

function getFilePreviewType(path: string): FilePreviewType {
	const ext = getFileExtension(path);
	switch (ext) {
		case "png":
			return { kind: "image", mimeType: "image/png", iconClass: "icon-image" };
		case "jpg":
		case "jpeg":
			return {
				kind: "image",
				mimeType: "image/jpeg",
				iconClass: "icon-image",
			};
		case "gif":
			return { kind: "image", mimeType: "image/gif", iconClass: "icon-image" };
		case "webp":
			return { kind: "image", mimeType: "image/webp", iconClass: "icon-image" };
		case "bmp":
			return { kind: "image", mimeType: "image/bmp", iconClass: "icon-image" };
		case "ico":
			return {
				kind: "image",
				mimeType: "image/x-icon",
				iconClass: "icon-image",
			};
		case "avif":
			return { kind: "image", mimeType: "image/avif", iconClass: "icon-image" };
		case "heic":
		case "heif":
			return { kind: "image", mimeType: "image/heic", iconClass: "icon-image" };
		case "tif":
		case "tiff":
			return { kind: "image", mimeType: "image/tiff", iconClass: "icon-image" };
		case "mp4":
			return { kind: "video", mimeType: "video/mp4", iconClass: "icon-video" };
		case "webm":
			return {
				kind: "video",
				mimeType: "video/webm",
				iconClass: "icon-video",
			};
		case "ogv":
			return { kind: "video", mimeType: "video/ogg", iconClass: "icon-video" };
		case "mov":
			return {
				kind: "video",
				mimeType: "video/quicktime",
				iconClass: "icon-video",
			};
		case "m4v":
			return {
				kind: "video",
				mimeType: "video/x-m4v",
				iconClass: "icon-video",
			};
		case "mp3":
			return { kind: "audio", mimeType: "audio/mpeg", iconClass: "icon-music" };
		case "wav":
			return { kind: "audio", mimeType: "audio/wav", iconClass: "icon-music" };
		case "ogg":
		case "oga":
			return { kind: "audio", mimeType: "audio/ogg", iconClass: "icon-music" };
		case "m4a":
			return { kind: "audio", mimeType: "audio/mp4", iconClass: "icon-music" };
		case "aac":
			return { kind: "audio", mimeType: "audio/aac", iconClass: "icon-music" };
		case "flac":
			return { kind: "audio", mimeType: "audio/flac", iconClass: "icon-music" };
		case "opus":
			return { kind: "audio", mimeType: "audio/opus", iconClass: "icon-music" };
		case "weba":
			return { kind: "audio", mimeType: "audio/webm", iconClass: "icon-music" };
		case "pdf":
			return {
				kind: "binary",
				label: ".pdf document",
				iconClass: "icon-file-text",
			};
		case "zip":
		case "tar":
		case "gz":
		case "bz2":
		case "xz":
		case "7z":
		case "rar":
		case "tgz":
		case "jar":
		case "war":
		case "dmg":
		case "iso":
		case "exe":
		case "dll":
		case "so":
		case "dylib":
		case "bin":
		case "dat":
		case "o":
		case "a":
		case "class":
		case "pyc":
		case "wasm":
		case "sqlite":
		case "db":
		case "ttf":
		case "otf":
		case "woff":
		case "woff2":
		case "doc":
		case "docx":
		case "xls":
		case "xlsx":
		case "ppt":
		case "pptx":
		case "psd":
			return {
				kind: "binary",
				label: ext ? `.${ext} binary file` : "Binary file",
				iconClass:
					ext === "zip" || ext === "tar" ? "icon-archive" : "icon-file",
			};
		default:
			return { kind: "text" };
	}
}

function UnsupportedBinaryWarning({
	fileName,
	message,
	filePath,
	fileType,
}: {
	fileName: string;
	message: string;
	filePath: string;
	fileType?: string;
}) {
	return (
		<div className="editor-binary-warning">
			<div className="editor-binary-warning__panel">
				<div className="editor-binary-warning__header">
					<Mascot state="thinking" size={42} tone="inline" />
					<h2>{fileName}</h2>
				</div>
				<p>{message}</p>
				<dl className="editor-binary-warning__meta">
					<div>
						<dt>Type</dt>
						<dd>{fileType ?? "Binary file"}</dd>
					</div>
					<div>
						<dt>Action</dt>
						<dd>Preview skipped</dd>
					</div>
				</dl>
				<div className="editor-binary-warning__path">{filePath}</div>
			</div>
		</div>
	);
}

function MediaPreview({
	fileName,
	previewType,
	url,
}: {
	fileName: string;
	previewType: FilePreviewType;
	url: string;
}) {
	const [imageZoomed, setImageZoomed] = useState(false);
	const imageStageRef = useRef<HTMLElement>(null);
	const imageFrameRef = useRef<HTMLDivElement>(null);
	const imageTransformRef = useRef({ zoom: 1, x: 0, y: 0 });
	const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
	const pinchRef = useRef<{
		distance: number;
		zoom: number;
		centerX: number;
		centerY: number;
		translateX: number;
		translateY: number;
	} | null>(null);
	const dragRef = useRef<{
		x: number;
		y: number;
		translateX: number;
		translateY: number;
	} | null>(null);

	const applyImageTransform = (nextTransform = imageTransformRef.current) => {
		const frame = imageFrameRef.current;
		if (!frame) return;
		frame.style.transform = `translate3d(${nextTransform.x}px, ${nextTransform.y}px, 0) scale(${nextTransform.zoom})`;
	};

	const constrainImageTransform = (transform: {
		zoom: number;
		x: number;
		y: number;
	}) => {
		const stage = imageStageRef.current;
		if (!stage || transform.zoom <= 1) return { zoom: 1, x: 0, y: 0 };

		const width = stage.clientWidth;
		const height = stage.clientHeight;
		const minX = width - width * transform.zoom;
		const minY = height - height * transform.zoom;

		return {
			zoom: transform.zoom,
			x: Math.min(0, Math.max(minX, transform.x)),
			y: Math.min(0, Math.max(minY, transform.y)),
		};
	};

	const updateZoom = (nextZoom: number, anchor?: { x: number; y: number }) => {
		const clampedZoom = Math.min(5, Math.max(1, nextZoom));
		const stage = imageStageRef.current;
		const current = imageTransformRef.current;

		if (!stage || !anchor) {
			const next = constrainImageTransform({
				zoom: clampedZoom,
				x: current.x,
				y: current.y,
			});
			imageTransformRef.current = next;
			applyImageTransform(next);
			setImageZoomed(next.zoom > 1);
			return;
		}

		const rect = stage.getBoundingClientRect();
		const anchorX = anchor.x - rect.left;
		const anchorY = anchor.y - rect.top;
		const contentX = (anchorX - current.x) / current.zoom;
		const contentY = (anchorY - current.y) / current.zoom;
		const next = constrainImageTransform({
			zoom: clampedZoom,
			x: anchorX - contentX * clampedZoom,
			y: anchorY - contentY * clampedZoom,
		});

		imageTransformRef.current = next;
		applyImageTransform(next);
		setImageZoomed(next.zoom > 1);
	};

	const handleImageWheel = (event: ReactWheelEvent<HTMLElement>) => {
		event.preventDefault();
		const direction = event.deltaY > 0 ? -1 : 1;
		const step = event.ctrlKey || event.metaKey ? 0.18 : 0.12;
		updateZoom(imageTransformRef.current.zoom * (1 + direction * step), {
			x: event.clientX,
			y: event.clientY,
		});
	};

	const handleImageDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
		updateZoom(imageTransformRef.current.zoom === 1 ? 2 : 1, {
			x: event.clientX,
			y: event.clientY,
		});
	};

	const getPointerDistance = () => {
		const points = Array.from(activePointersRef.current.values());
		if (points.length < 2) return 0;
		return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
	};

	const getPointerCenter = () => {
		const points = Array.from(activePointersRef.current.values());
		return {
			x: (points[0].x + points[1].x) / 2,
			y: (points[0].y + points[1].y) / 2,
		};
	};

	const handleImagePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
		const stage = imageStageRef.current;
		if (!stage) return;

		activePointersRef.current.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY,
		});
		stage.setPointerCapture(event.pointerId);

		if (activePointersRef.current.size === 2) {
			const rect = stage.getBoundingClientRect();
			const center = getPointerCenter();
			pinchRef.current = {
				distance: getPointerDistance(),
				zoom: imageTransformRef.current.zoom,
				centerX: center.x - rect.left,
				centerY: center.y - rect.top,
				translateX: imageTransformRef.current.x,
				translateY: imageTransformRef.current.y,
			};
			dragRef.current = null;
		} else if (imageTransformRef.current.zoom > 1) {
			dragRef.current = {
				x: event.clientX,
				y: event.clientY,
				translateX: imageTransformRef.current.x,
				translateY: imageTransformRef.current.y,
			};
		}
	};

	const handleImagePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
		const stage = imageStageRef.current;
		if (!stage || !activePointersRef.current.has(event.pointerId)) return;

		activePointersRef.current.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY,
		});

		if (activePointersRef.current.size >= 2 && pinchRef.current) {
			const distance = getPointerDistance();
			if (distance > 0 && pinchRef.current.distance > 0) {
				const newZoom =
					pinchRef.current.zoom * (distance / pinchRef.current.distance);
				const clampedZoom = Math.min(5, Math.max(1, newZoom));
				const rect = stage.getBoundingClientRect();
				const center = getPointerCenter();
				const currentCenterX = center.x - rect.left;
				const currentCenterY = center.y - rect.top;

				const contentX =
					(pinchRef.current.centerX - pinchRef.current.translateX) /
					pinchRef.current.zoom;
				const contentY =
					(pinchRef.current.centerY - pinchRef.current.translateY) /
					pinchRef.current.zoom;

				const next = constrainImageTransform({
					zoom: clampedZoom,
					x: currentCenterX - contentX * clampedZoom,
					y: currentCenterY - contentY * clampedZoom,
				});
				imageTransformRef.current = next;
				applyImageTransform(next);
				setImageZoomed(next.zoom > 1);
			}
			return;
		}

		if (dragRef.current && imageTransformRef.current.zoom > 1) {
			const next = constrainImageTransform({
				zoom: imageTransformRef.current.zoom,
				x: dragRef.current.translateX + (event.clientX - dragRef.current.x),
				y: dragRef.current.translateY + (event.clientY - dragRef.current.y),
			});
			imageTransformRef.current = next;
			applyImageTransform(next);
		}
	};

	const handleImagePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
		const stage = imageStageRef.current;
		activePointersRef.current.delete(event.pointerId);
		if (stage?.hasPointerCapture(event.pointerId)) {
			stage.releasePointerCapture(event.pointerId);
		}

		if (activePointersRef.current.size < 2) {
			pinchRef.current = null;
		}

		if (
			activePointersRef.current.size === 1 &&
			imageTransformRef.current.zoom > 1 &&
			stage
		) {
			const point = Array.from(activePointersRef.current.values())[0];
			dragRef.current = {
				x: point.x,
				y: point.y,
				translateX: imageTransformRef.current.x,
				translateY: imageTransformRef.current.y,
			};
		} else {
			dragRef.current = null;
		}
	};

	if (previewType.kind === "image") {
		return (
			<div className="editor-media-viewer editor-media-viewer--image">
				<section
					ref={imageStageRef}
					className={`editor-image-stage${imageZoomed ? " editor-image-stage--zoomed" : ""}`}
					aria-label="Zoomable image preview"
					onWheel={handleImageWheel}
					onPointerDown={handleImagePointerDown}
					onPointerMove={handleImagePointerMove}
					onPointerUp={handleImagePointerEnd}
					onPointerCancel={handleImagePointerEnd}
					onDoubleClick={handleImageDoubleClick}
				>
					<div ref={imageFrameRef} className="editor-image-frame">
						<img src={url} alt={fileName} />
					</div>
				</section>
			</div>
		);
	}

	if (previewType.kind === "video") {
		return (
			<div className="editor-media-viewer">
				<video src={url} controls playsInline />
			</div>
		);
	}

	if (previewType.kind === "audio") {
		return (
			<div className="editor-audio-viewer">
				<div className="editor-audio-viewer__icon">
					<span className="icon-music" aria-hidden="true" />
				</div>
				<div className="editor-audio-viewer__name">{fileName}</div>
				<audio src={url} controls />
			</div>
		);
	}

	return null;
}
export default function EditorPage({
	filePath,
	gitStatus,
	initialLine,
	initialColumn,
	readOnly,
	pageId,
	gitComparison,
}: CodeMirrorEditorPageProps) {
	const { readFile, readFileBytes, readGitFile, runGitOperation, writeFile } =
		useShellular();
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const mergeViewRef = useRef<MergeView | null>(null);
	const editorViewClassRef = useRef<typeof EditorView | null>(null);
	const editorSettingsRef = useRef<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
	const editorSettingsCompartmentRef = useRef(new Compartment());
	const readOnlySettingsCompartmentRef = useRef(new Compartment());
	const appThemeCompartmentRef = useRef(new Compartment());
	const appThemeExtensionRef = useRef<Extension>(
		process.env.IS_MACOS && themes.current
			? createCodeMirrorAppTheme(themes.current)
			: [],
	);
	const loadRequestRef = useRef(0);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [binaryWarning, setBinaryWarning] = useState<string | null>(null);
	const [mediaUrl, setMediaUrl] = useState<string | null>(null);
	const [dirty, setDirty] = useState(false);
	const [editorVersion, setEditorVersion] = useState(0);
	const [gitRefreshToken, setGitRefreshToken] = useState(0);
	const [findOpen, setFindOpen] = useState(false);
	const [diffMode, setDiffMode] = useState<DiffMode>(
		window.innerWidth < 600 ? "unified" : "split",
	);
	const previewType = useMemo(() => getFilePreviewType(filePath), [filePath]);
	const usesInlinePreview = previewType.kind !== "text";
	const [showDiff, setShowDiff] = useState(
		!!(
			!usesInlinePreview &&
			(gitComparison ||
				(gitStatus && gitStatus !== "untracked" && gitStatus !== "ignored"))
		),
	);

	const fileName = filePath.split("/").pop() || filePath;
	const isMediaPreview =
		previewType.kind === "image" ||
		previewType.kind === "video" ||
		previewType.kind === "audio" ||
		previewType.kind === "pdf";
	const unsupportedBinaryMessage =
		previewType.kind === "binary"
			? "This file is not safe to render as UTF-8 text, so it was not loaded into the editor."
			: binaryWarning;
	const canUseEditor = previewType.kind === "text" && !binaryWarning;
	const hasChanges =
		canUseEditor &&
		showDiff &&
		(Boolean(gitComparison) ||
			Boolean(
				gitStatus && gitStatus !== "untracked" && gitStatus !== "ignored",
			));

	useEffect(() => {
		if (!gitComparison) return;
		const refresh = () => setGitRefreshToken((value) => value + 1);
		window.addEventListener(GIT_WORKTREE_CHANGED_EVENT, refresh);
		return () =>
			window.removeEventListener(GIT_WORKTREE_CHANGED_EVENT, refresh);
	}, [gitComparison]);

	useEffect(() => {
		if (!pageId) return;
		if (process.env.IS_DESKTOP_UI) {
			return registerWorkbenchCloseGuard(pageId, async (context) => {
				if (!dirty || readOnly) return true;
				if (context?.destructiveConfirmed) return true;
				return dialog.confirm("Discard unsaved changes?", "Unsaved Changes");
			});
		}
		actionStack.replace({
			id: pageId,
			action: async () => {
				if (!dirty || readOnly) {
					closePage(pageId);
					return;
				}
				const confirmed = await dialog.confirm(
					"Discard unsaved changes?",
					"Unsaved Changes",
				);
				if (!confirmed) return false;
				closePage(pageId);
			},
		});
	}, [dirty, pageId, readOnly]);

	const destroyViews = useCallback(() => {
		viewRef.current?.destroy();
		viewRef.current = null;
		mergeViewRef.current?.destroy();
		mergeViewRef.current = null;
		if (editorRef.current) {
			editorRef.current.innerHTML = "";
		}
		setEditorVersion((version) => version + 1);
	}, []);

	const createSettingsExtension = useCallback(
		(editorViewCtor: typeof EditorView, readOnly = false) => {
			const compartment = readOnly
				? readOnlySettingsCompartmentRef.current
				: editorSettingsCompartmentRef.current;
			return compartment.of(
				createEditorSettingsExtensions(
					editorViewCtor,
					editorSettingsRef.current,
				),
			);
		},
		[],
	);

	const createAppThemeExtension = useCallback(
		() => appThemeCompartmentRef.current.of(appThemeExtensionRef.current),
		[],
	);

	useEffect(() => {
		if (!process.env.IS_MACOS) return;
		return themes.subscribe((theme) => {
			const extension = createCodeMirrorAppTheme(theme);
			appThemeExtensionRef.current = extension;
			viewRef.current?.dispatch({
				effects: appThemeCompartmentRef.current.reconfigure(extension),
			});
			const mergeView = mergeViewRef.current as
				| (MergeView & { a?: EditorView; b?: EditorView })
				| null;
			mergeView?.a?.dispatch({
				effects: appThemeCompartmentRef.current.reconfigure(extension),
			});
			mergeView?.b?.dispatch({
				effects: appThemeCompartmentRef.current.reconfigure(extension),
			});
		});
	}, []);

	const revealInitialPosition = useCallback(
		(view: EditorView) => {
			if (!initialLine || initialLine < 1) return;
			const editorViewCtor = editorViewClassRef.current;
			if (!editorViewCtor) return;

			const line = view.state.doc.line(
				Math.min(initialLine, view.state.doc.lines),
			);
			const columnOffset =
				initialColumn && initialColumn > 1 ? initialColumn - 1 : 0;
			const position = Math.min(line.to, line.from + columnOffset);
			view.dispatch({
				selection: { anchor: position },
				effects: editorViewCtor.scrollIntoView(position, { y: "center" }),
			});
			view.focus();
		},
		[initialColumn, initialLine],
	);

	const reconfigureEditorSettings = useCallback((settings: EditorSettings) => {
		editorSettingsRef.current = settings;
		const editorViewCtor = editorViewClassRef.current;
		if (!editorViewCtor) return;
		const extensions = createEditorSettingsExtensions(editorViewCtor, settings);

		viewRef.current?.dispatch({
			effects: editorSettingsCompartmentRef.current.reconfigure(extensions),
		});

		const mergeView = mergeViewRef.current as
			| (MergeView & { a?: EditorView; b?: EditorView })
			| null;
		mergeView?.a?.dispatch({
			effects: readOnlySettingsCompartmentRef.current.reconfigure(extensions),
		});
		mergeView?.b?.dispatch({
			effects: readOnlySettingsCompartmentRef.current.reconfigure(extensions),
		});
	}, []);

	useEffect(() => {
		if (!filePath) return;
		setShowDiff(
			!!(
				!usesInlinePreview &&
				(gitComparison ||
					(gitStatus && gitStatus !== "untracked" && gitStatus !== "ignored"))
			),
		);
		setDirty(false);
		setFindOpen(false);
		setError(null);
		setBinaryWarning(null);
		setMediaUrl(null);
	}, [filePath, gitComparison, gitStatus, usesInlinePreview]);

	useEffect(() => {
		let mounted = true;
		loadSettings().then((settings) => {
			if (mounted) reconfigureEditorSettings(settings.editor);
		});

		const onSettingsChanged = (event: Event) => {
			const settings = (event as CustomEvent<AppSettings>).detail;
			if (settings?.editor) reconfigureEditorSettings(settings.editor);
		};

		window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
		return () => {
			mounted = false;
			window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
		};
	}, [reconfigureEditorSettings]);

	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth < 600) {
				setDiffMode("unified");
			} else {
				setDiffMode("split");
			}
			destroyViews();
		};

		window.addEventListener("resize", handleResize);
		return () => {
			window.removeEventListener("resize", handleResize);
		};
	}, [destroyViews]);

	// Prevent iOS from scrolling the whole viewport when the keyboard opens.
	// iOS auto-scrolls window to keep the focused contentEditable cursor visible,
	// but since the app is position:fixed this shifts the entire UI up.
	// We reset window scroll and let CodeMirror handle scrolling internally.
	useEffect(() => {
		const resetScroll = () => {
			if (window.scrollX !== 0 || window.scrollY !== 0) {
				window.scrollTo(0, 0);
			}
		};

		// After resetting window scroll, tell CodeMirror to scroll its
		// cursor into view within its own scroller.
		const scrollCursorIntoView = () => {
			const view = viewRef.current;
			const EV = editorViewClassRef.current;
			if (!view || !EV) return;
			try {
				view.dispatch({
					effects: EV.scrollIntoView(view.state.selection.main.head, {
						y: "center",
					}),
				});
			} catch {}
		};

		const onKeyboardShow = () => {
			resetScroll();
			requestAnimationFrame(() => {
				resetScroll();
				scrollCursorIntoView();
			});
		};

		const onViewportScroll = () => {
			resetScroll();
		};

		keyboard.on("show", onKeyboardShow);
		window.visualViewport?.addEventListener("scroll", onViewportScroll);
		window.visualViewport?.addEventListener("resize", onViewportScroll);

		return () => {
			keyboard.off("show", onKeyboardShow);
			window.visualViewport?.removeEventListener("scroll", onViewportScroll);
			window.visualViewport?.removeEventListener("resize", onViewportScroll);
		};
	}, []);

	const initDiffView = useCallback(async () => {
		void gitRefreshToken;
		if (!editorRef.current || !canUseEditor || !hasChanges) return;
		const requestId = ++loadRequestRef.current;
		setLoading(true);
		setError(null);
		setBinaryWarning(null);
		setMediaUrl(null);

		try {
			let current: string;
			let original: string;
			if (gitComparison) {
				const result = await runGitOperation(
					gitComparison.projectPath,
					"diff",
					{
						file: gitComparison.relativePath,
						diffTarget: gitComparison.target,
					},
				);
				if (!result.diff) throw new Error("No diff data received");
				if (result.diff.binary) {
					setBinaryWarning("Binary file diff is not available.");
					return;
				}
				current = result.diff.newText;
				original = result.diff.oldText;
			} else {
				[current, original] = await Promise.all([
					readFile(filePath),
					readGitFile(filePath),
				]);
			}

			const { EditorView, basicSetup } = await import("codemirror");
			const { MergeView, unifiedMergeView } = await import("@codemirror/merge");
			const { champagneNoirCodeMirrorTheme } = await import(
				"lib/codemirrorTheme"
			);
			const { EditorState } = await import("@codemirror/state");

			editorViewClassRef.current = EditorView;

			const lang = await loadLanguageForFilename(filePath);
			if (loadRequestRef.current !== requestId) return;

			destroyViews();

			if (diffMode === "split") {
				const readOnlyExtensions = [
					basicSetup,
					champagneNoirCodeMirrorTheme,
					createAppThemeExtension(),
					createSettingsExtension(EditorView, true),
					EditorView.editable.of(false),
					EditorState.readOnly.of(true),
				];
				if (lang) readOnlyExtensions.push(lang);

				mergeViewRef.current = new MergeView({
					a: {
						doc: original,
						extensions: readOnlyExtensions,
					},
					b: {
						doc: current,
						extensions: readOnlyExtensions,
					},
					parent: editorRef.current,
					gutter: true,
					collapseUnchanged: { minSize: 3, margin: 3 },
				});
			} else {
				const extensions = [
					basicSetup,
					champagneNoirCodeMirrorTheme,
					createAppThemeExtension(),
				];
				extensions.push(createSettingsExtension(EditorView));
				if (lang) extensions.push(lang);
				extensions.push(EditorView.editable.of(false));
				extensions.push(EditorState.readOnly.of(true));
				extensions.push(
					unifiedMergeView({
						original,
						mergeControls: false,
						collapseUnchanged: { minSize: 3, margin: 3 },
					}),
				);

				viewRef.current = new EditorView({
					doc: current,
					extensions,
					parent: editorRef.current,
				});
			}
		} catch (err) {
			if (loadRequestRef.current !== requestId) return;
			const message = (err as Error).message || "Failed to load diff";
			if (message.includes("binary file")) {
				setBinaryWarning(message);
			} else {
				setError(message);
			}
		} finally {
			if (loadRequestRef.current === requestId) {
				setLoading(false);
			}
		}
	}, [
		destroyViews,
		diffMode,
		filePath,
		readFile,
		readGitFile,
		runGitOperation,
		canUseEditor,
		createSettingsExtension,
		createAppThemeExtension,
		hasChanges,
		gitComparison,
		gitRefreshToken,
	]);

	const initEditor = useCallback(async () => {
		if (!editorRef.current || !canUseEditor) return;
		const requestId = ++loadRequestRef.current;
		setLoading(true);
		setError(null);
		setBinaryWarning(null);
		setMediaUrl(null);

		try {
			const content = await readFile(filePath);
			const { EditorView, basicSetup } = await import("codemirror");
			editorViewClassRef.current = EditorView;
			const { champagneNoirCodeMirrorTheme } = await import(
				"lib/codemirrorTheme"
			);

			const extensions = [
				basicSetup,
				champagneNoirCodeMirrorTheme,
				createAppThemeExtension(),
				createSettingsExtension(EditorView),
				search({ createPanel: createHiddenSearchPanel }),
			];

			// Add language support
			const langExt = await loadLanguageForFilename(filePath);
			if (langExt) extensions.push(langExt);
			if (loadRequestRef.current !== requestId) return;

			// Track changes
			extensions.push(
				EditorView.updateListener.of((update) => {
					if (update.docChanged) setDirty(true);
					if (update.docChanged || update.selectionSet) {
						setEditorVersion((version) => version + 1);
					}
				}),
			);

			if (readOnly) {
				const { EditorState } = await import("@codemirror/state");
				extensions.push(
					EditorView.editable.of(false),
					EditorState.readOnly.of(true),
				);
			}

			destroyViews();

			viewRef.current = new EditorView({
				doc: content,
				extensions,
				parent: editorRef.current,
			});
			revealInitialPosition(viewRef.current);
		} catch (err) {
			if (loadRequestRef.current !== requestId) return;
			const message = (err as Error).message || "Failed to open file";
			if (message.includes("binary file")) {
				setBinaryWarning(message);
			} else {
				setError(message);
			}
		} finally {
			if (loadRequestRef.current === requestId) {
				setLoading(false);
			}
		}
	}, [
		destroyViews,
		filePath,
		readFile,
		canUseEditor,
		createAppThemeExtension,
		createSettingsExtension,
		revealInitialPosition,
		readOnly,
	]);

	useEffect(() => {
		if (!isMediaPreview) return;
		const requestId = ++loadRequestRef.current;
		let objectUrl: string | null = null;

		destroyViews();
		setLoading(true);
		setError(null);
		setBinaryWarning(null);
		setMediaUrl(null);

		readFileBytes(filePath)
			.then((bytes) => {
				if (loadRequestRef.current !== requestId) return;
				const buffer = new ArrayBuffer(bytes.byteLength);
				new Uint8Array(buffer).set(bytes);
				objectUrl = URL.createObjectURL(
					new Blob([buffer], { type: previewType.mimeType }),
				);
				setMediaUrl(objectUrl);
			})
			.catch((err) => {
				if (loadRequestRef.current !== requestId) return;
				setError((err as Error).message || "Failed to preview file");
			})
			.finally(() => {
				if (loadRequestRef.current === requestId) {
					setLoading(false);
				}
			});

		return () => {
			loadRequestRef.current += 1;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			setMediaUrl(null);
		};
	}, [destroyViews, filePath, isMediaPreview, previewType, readFileBytes]);

	useEffect(() => {
		if (previewType.kind !== "binary") return;
		loadRequestRef.current += 1;
		destroyViews();
		setLoading(false);
		setError(null);
		setBinaryWarning(null);
		setMediaUrl(null);
	}, [destroyViews, previewType.kind]);

	useEffect(() => {
		if (!canUseEditor) return;
		if (showDiff) {
			initDiffView();
		} else {
			initEditor();
		}
		return () => {
			loadRequestRef.current += 1;
			destroyViews();
		};
	}, [showDiff, initDiffView, initEditor, destroyViews, canUseEditor]);

	const handleSave = async () => {
		if (!viewRef.current || showDiff) return;
		setSaving(true);
		try {
			const content = viewRef.current.state.doc.toString();
			await writeFile(filePath, content);
			setDirty(false);
		} catch (err) {
			setError((err as Error).message || "Failed to save");
		} finally {
			setSaving(false);
		}
	};

	const handleEdit = () => {
		setShowDiff(false);
		setDirty(false);
	};

	const editButton = canUseEditor &&
		showDiff &&
		!readOnly &&
		gitStatus !== "deleted" && (
			<button
				type="button"
				className="page-header-action"
				onClick={handleEdit}
				aria-label="Edit"
			>
				<span className="icon-edit" aria-hidden="true" />
			</button>
		);

	const saveButton = canUseEditor && !showDiff && !readOnly && (
		<button
			type="button"
			className="page-header-action"
			onClick={handleSave}
			disabled={!dirty || saving}
			aria-label="Save"
		>
			{saving ? (
				<Loader size={18} />
			) : (
				<span className="icon-save" aria-hidden="true" />
			)}
		</button>
	);

	const searchButton = canUseEditor && !showDiff && (
		<button
			type="button"
			className="page-header-action"
			onClick={() => setFindOpen((open) => !open)}
			aria-label={findOpen ? "Close find" : "Find"}
		>
			<span
				className={findOpen ? "icon-x" : "icon-search"}
				aria-hidden="true"
			/>
		</button>
	);

	const editorActions =
		canUseEditor && !showDiff ? (
			<>
				{searchButton}
				{saveButton}
			</>
		) : undefined;

	return (
		<Page
			title={fileName}
			className="editor-page"
			titleSlot={dirty ? <span className="editor-dirty-dot" /> : undefined}
			rightSlot={
				canUseEditor && showDiff
					? editButton
					: canUseEditor
						? editorActions
						: undefined
			}
			zIndex={150}
			noBottomSafeArea
		>
			{error && <div className="editor-error">{error}</div>}
			{loading && <EmptyState message="Loading file..." mascot="loading" />}
			{!loading && unsupportedBinaryMessage && (
				<UnsupportedBinaryWarning
					fileName={fileName}
					message={unsupportedBinaryMessage}
					filePath={filePath}
					fileType={previewType.label}
				/>
			)}
			{!loading && isMediaPreview && mediaUrl && (
				<MediaPreview
					key={mediaUrl}
					fileName={fileName}
					previewType={previewType}
					url={mediaUrl}
				/>
			)}
			{canUseEditor && (
				<div
					className={`editor-container${showDiff && diffMode === "split" ? " editor-container--split" : ""}`}
					ref={editorRef}
					style={loading ? { display: "none" } : undefined}
				/>
			)}
			{canUseEditor && !showDiff && viewRef.current && (
				<>
					<EditorFindReplace
						editorView={viewRef.current}
						editorVersion={editorVersion}
						visible={findOpen}
						onOpen={() => setFindOpen(true)}
					/>
					<EditorToolbar editorView={viewRef.current} />
				</>
			)}
		</Page>
	);
}
