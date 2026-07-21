import {
	FileTree as FileTreeModel,
	type GitStatusEntry,
	prepareFileTreeInput,
} from "@pierre/trees";
import { FileTree } from "@pierre/trees/react";
import { showContextMenu } from "context-menu/service";
import type {
	CommandId,
	ContextMenuId,
	ContextMenuTrigger,
} from "context-menu/types";
import {
	Component,
	type CSSProperties,
	type ErrorInfo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { GitFileStatus } from "state";
import {
	getGitStatusPresentation,
	TREE_GIT_STATUS_STYLE,
} from "./gitStatusPresentation";
import {
	SHELLULAR_TREE_ICONS,
	TREE_ICON_THEME_STYLE,
} from "./ShellularFileIcon";

export interface ShellularTreeEntry {
	path: string;
	type: "directory" | "file";
	gitStatus?: GitFileStatus;
}

export interface ShellularTreeAction {
	command: CommandId;
	label: string;
	icon: string;
	danger?: boolean;
	disabled?: boolean;
	onClick: () => void | Promise<void>;
}

export interface ShellularFileTreeModel {
	add(
		path: string,
		type: ShellularTreeEntry["type"],
		revision?: TreeRevision,
	): void;
	closeSearch(): void;
	getSearchMatchingPaths(): string[];
	move(
		fromPath: string,
		toPath: string,
		type: ShellularTreeEntry["type"],
		revision?: TreeRevision,
	): void;
	openSearch(initialValue?: string): void;
	remove(
		path: string,
		type: ShellularTreeEntry["type"],
		revision?: TreeRevision,
	): void;
}

interface ShellularFileTreeProps {
	ariaLabel: string;
	cacheKey?: string;
	revision?: TreeRevision;
	entries: ShellularTreeEntry[];
	initialExpansion?: "closed" | "open" | number;
	onActivate: (path: string) => void;
	onSelectionChange?: (paths: readonly string[]) => void;
	actionsForItem?: (
		path: string,
		type: "directory" | "file",
		selectedPaths: readonly string[],
	) => ShellularTreeAction[];
	contextMenuIdForItem?: (
		path: string,
		type: "directory" | "file",
	) => ContextMenuId;
	onModel?: (model: ShellularFileTreeModel | null) => void;
	onError?: (error: Error) => void;
	onRetry?: () => void;
}

type TreeRevision = number | string;

interface CachedTreeModel {
	key: string;
	model: FileTreeModel;
	revision: TreeRevision | null | undefined;
	resetCount: number;
	refCount: number;
	lastUsed: number;
	disposeTimer: ReturnType<typeof setTimeout> | null;
	persistent: boolean;
	handlers: {
		onSelectionChange?: (paths: readonly string[]) => void;
	};
}

const TREE_CACHE_LIMIT = 24;
const TREE_CACHE_IDLE_MS = 5 * 60 * 1000;
const treeModels = new Map<string, CachedTreeModel>();
let transientTreeId = 0;

export default function ShellularFileTree({
	ariaLabel,
	cacheKey,
	revision,
	entries,
	initialExpansion = "closed",
	onActivate,
	onSelectionChange,
	actionsForItem,
	contextMenuIdForItem,
	onModel,
	onError,
	onRetry,
}: ShellularFileTreeProps) {
	const transientKey = useRef<string | null>(null);
	if (!transientKey.current) {
		transientTreeId += 1;
		transientKey.current = `transient:${transientTreeId}`;
	}
	const resolvedCacheKey = cacheKey ?? transientKey.current;
	const activateRef = useRef(onActivate);
	const contextMenuTriggerRef = useRef<ContextMenuTrigger>("keyboard");
	const selectionRef = useRef(onSelectionChange);
	const [treeError, setTreeError] = useState<Error | null>(null);
	const [retryToken, setRetryToken] = useState(0);
	activateRef.current = onActivate;
	selectionRef.current = onSelectionChange;
	const reportError = useCallback(
		(error: unknown) => {
			const resolved =
				error instanceof Error
					? error
					: new Error("Unable to render file tree");
			setTreeError(resolved);
			onError?.(resolved);
		},
		[onError],
	);
	const validationError = useMemo(() => validateEntries(entries), [entries]);
	const entryByPath = useMemo(
		() => new Map(entries.map((entry) => [normalizePath(entry.path), entry])),
		[entries],
	);
	const canonicalPaths = useMemo(
		() => entries.map((entry) => canonicalPath(entry.path, entry.type)),
		[entries],
	);
	const gitStatus = useMemo(
		() =>
			entries.flatMap((entry): GitStatusEntry[] => {
				if (!entry.gitStatus) return [];
				return [
					{
						path: canonicalPath(entry.path, entry.type),
						status: getGitStatusPresentation(entry.gitStatus).status,
					},
				];
			}),
		[entries],
	);
	const cachedTree = useMemo(
		() =>
			getOrCreateTreeModel(
				resolvedCacheKey,
				initialExpansion,
				Boolean(cacheKey),
			),
		[cacheKey, initialExpansion, resolvedCacheKey],
	);
	const { model } = cachedTree;
	cachedTree.handlers.onSelectionChange = (paths) =>
		selectionRef.current?.(paths.map(normalizePath));
	const shellularModel = useMemo<ShellularFileTreeModel>(
		() => ({
			add: (path, type, nextRevision) => {
				try {
					model.add(canonicalPath(path, type));
					if (nextRevision !== undefined) cachedTree.revision = nextRevision;
				} catch (error) {
					reportError(error);
				}
			},
			closeSearch: () => {
				try {
					model.closeSearch();
				} catch (error) {
					reportError(error);
				}
			},
			getSearchMatchingPaths: () =>
				model.getSearchMatchingPaths().map(normalizePath),
			move: (fromPath, toPath, type, nextRevision) => {
				try {
					model.move(
						canonicalPath(fromPath, type),
						canonicalPath(toPath, type),
					);
					if (nextRevision !== undefined) cachedTree.revision = nextRevision;
				} catch (error) {
					reportError(error);
				}
			},
			openSearch: (initialValue) => {
				try {
					model.openSearch(initialValue);
				} catch (error) {
					reportError(error);
				}
			},
			remove: (path, type, nextRevision) => {
				try {
					model.remove(canonicalPath(path, type), { recursive: true });
					if (nextRevision !== undefined) cachedTree.revision = nextRevision;
				} catch (error) {
					reportError(error);
				}
			},
		}),
		[cachedTree, model, reportError],
	);

	useEffect(() => {
		void retryToken;
		if (validationError) {
			reportError(validationError);
			return;
		}
		if (cachedTree.revision === (revision ?? null)) return;
		try {
			const expanded = canonicalPaths.filter((path) => {
				const item = model.getItem(path);
				return item?.isDirectory() && "isExpanded" in item
					? item.isExpanded()
					: false;
			});
			const selected = model.getSelectedPaths().map(normalizePath);
			const preparedInput = prepareFileTreeInput(canonicalPaths);
			model.resetPaths({ preparedInput, initialExpandedPaths: expanded });
			cachedTree.resetCount += 1;
			model.setGitStatus(gitStatus);
			for (const path of selected) model.getItem(path)?.select();
			cachedTree.revision = revision ?? null;
			setTreeError(null);
		} catch (error) {
			reportError(error);
		}
	}, [
		cachedTree,
		canonicalPaths,
		gitStatus,
		model,
		reportError,
		retryToken,
		revision,
		validationError,
	]);

	useEffect(() => {
		acquireTreeModel(cachedTree);
		return () => releaseTreeModel(cachedTree);
	}, [cachedTree]);

	useEffect(() => {
		onModel?.(shellularModel);
		return () => onModel?.(null);
	}, [onModel, shellularModel]);

	const retry = () => {
		cachedTree.revision = undefined;
		setTreeError(null);
		setRetryToken((current) => current + 1);
		onRetry?.();
	};

	if (treeError) {
		return <TreeErrorState error={treeError} onRetry={retry} />;
	}

	return (
		<TreeRenderBoundary key={retryToken} onError={reportError} onRetry={retry}>
			<FileTree
				model={model}
				aria-label={ariaLabel}
				className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent text-primary-text outline-none"
				style={TREE_THEME_STYLE}
				onClick={(event) => {
					if (event.nativeEvent.composedPath().some(isContextMenuTrigger)) {
						contextMenuTriggerRef.current = "button";
						return;
					}
					const path = itemPathFromEvent(event);
					if (!path || entryByPath.get(path)?.type !== "file") return;
					activateRef.current(path);
				}}
				onKeyDown={(event) => {
					if (
						event.key === "ContextMenu" ||
						(event.shiftKey && event.key === "F10")
					) {
						contextMenuTriggerRef.current = "keyboard";
					}
					if (event.key !== "Enter") return;
					const path = normalizePath(model.getFocusedPath() ?? "");
					if (!path || entryByPath.get(path)?.type !== "file") return;
					event.preventDefault();
					activateRef.current(path);
				}}
				onContextMenu={() => {
					contextMenuTriggerRef.current = "context";
				}}
				renderContextMenu={
					actionsForItem
						? (item, context) => (
								<TreeContextMenu
									actions={actionsForItem(
										normalizePath(item.path),
										item.kind,
										selectedContextPaths(model, item.path),
									)}
									menuId={
										contextMenuIdForItem?.(
											normalizePath(item.path),
											item.kind,
										) ??
										(item.kind === "directory"
											? "project-tree-directory"
											: "project-tree-file")
									}
									anchor={context.anchorRect}
									origin={context.anchorElement}
									trigger={contextMenuTriggerRef.current}
									onClose={() => context.close({ restoreFocus: false })}
								/>
							)
						: undefined
				}
			/>
		</TreeRenderBoundary>
	);
}

class TreeRenderBoundary extends Component<
	{
		children: ReactNode;
		onError: (error: Error) => void;
		onRetry: () => void;
	},
	{ error: Error | null }
> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, _info: ErrorInfo) {
		this.props.onError(error);
	}

	render() {
		return this.state.error ? (
			<TreeErrorState error={this.state.error} onRetry={this.props.onRetry} />
		) : (
			this.props.children
		);
	}
}

function TreeErrorState({
	error,
	onRetry,
}: {
	error: Error;
	onRetry: () => void;
}) {
	return (
		<div
			className="m-2 flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger"
			role="alert"
		>
			<span className="break-words">{error.message}</span>
			<button
				type="button"
				className="self-start rounded border border-danger/40 px-2 py-1 text-primary-text hover:bg-surface-soft"
				onClick={onRetry}
			>
				Refresh tree
			</button>
		</div>
	);
}

function validateEntries(entries: ShellularTreeEntry[]) {
	const paths = new Map<string, ShellularTreeEntry["type"]>();
	for (const entry of entries) {
		const path = normalizePath(entry.path);
		const segments = path.split("/");
		if (
			!path ||
			path.startsWith("/") ||
			/^[a-zA-Z]:\//.test(path) ||
			segments.some(
				(segment) => !segment || segment === "." || segment === "..",
			)
		) {
			return new Error(`Invalid relative tree path: "${entry.path}"`);
		}
		const existing = paths.get(path);
		if (existing) {
			return new Error(
				existing === entry.type
					? `Duplicate tree path: "${path}"`
					: `Conflicting tree entry types for: "${path}"`,
			);
		}
		paths.set(path, entry.type);
	}
	return null;
}

function selectedContextPaths(model: FileTreeModel, contextPath: string) {
	const path = normalizePath(contextPath);
	const selected = model.getSelectedPaths().map(normalizePath);
	return selected.includes(path) ? selected : [path];
}

function getOrCreateTreeModel(
	key: string,
	initialExpansion: "closed" | "open" | number,
	persistent: boolean,
) {
	const existing = treeModels.get(key);
	if (existing) {
		existing.lastUsed = Date.now();
		return existing;
	}
	const handlers: CachedTreeModel["handlers"] = {};
	const entry: CachedTreeModel = {
		key,
		model: new FileTreeModel({
			paths: [],
			density: "compact",
			icons: SHELLULAR_TREE_ICONS,
			initialExpansion,
			search: true,
			stickyFolders: true,
			unsafeCSS: TREE_UNSAFE_STYLE,
			onSelectionChange: (paths) => handlers.onSelectionChange?.(paths),
		}),
		revision: undefined,
		resetCount: 0,
		refCount: 0,
		lastUsed: Date.now(),
		disposeTimer: null,
		persistent,
		handlers,
	};
	treeModels.set(key, entry);
	entry.disposeTimer = setTimeout(
		() => disposeTreeModel(entry.key),
		persistent ? TREE_CACHE_IDLE_MS : 1,
	);
	trimTreeModelCache();
	return entry;
}

function acquireTreeModel(entry: CachedTreeModel) {
	entry.refCount += 1;
	entry.lastUsed = Date.now();
	if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
	entry.disposeTimer = null;
}

function releaseTreeModel(entry: CachedTreeModel) {
	entry.refCount = Math.max(0, entry.refCount - 1);
	entry.lastUsed = Date.now();
	if (entry.refCount > 0) return;
	if (!entry.persistent) {
		entry.disposeTimer = setTimeout(() => disposeTreeModel(entry.key), 1);
		return;
	}
	entry.disposeTimer = setTimeout(
		() => disposeTreeModel(entry.key),
		TREE_CACHE_IDLE_MS,
	);
	trimTreeModelCache();
}

function trimTreeModelCache() {
	const inactive = [...treeModels.values()]
		.filter((entry) => entry.refCount === 0)
		.sort((left, right) => left.lastUsed - right.lastUsed);
	while (treeModels.size > TREE_CACHE_LIMIT && inactive.length > 0) {
		const oldest = inactive.shift();
		if (oldest) disposeTreeModel(oldest.key);
	}
}

function disposeTreeModel(key: string) {
	const entry = treeModels.get(key);
	if (!entry || entry.refCount > 0) return;
	if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
	entry.handlers.onSelectionChange = undefined;
	entry.model.cleanUp();
	treeModels.delete(key);
}

export function pruneShellularFileTreeCache(
	namespace: "git" | "project",
	activeKeys: Iterable<string>,
) {
	const active = new Set(activeKeys);
	for (const [key, entry] of treeModels) {
		if (!key.startsWith(`${namespace}:`) || active.has(key)) continue;
		if (entry.refCount === 0) disposeTreeModel(key);
	}
}

export function resetShellularFileTreeCache() {
	for (const entry of treeModels.values()) {
		entry.refCount = 0;
		disposeTreeModel(entry.key);
	}
}

export function getShellularFileTreeCacheStats(cacheKey: string) {
	const entry = treeModels.get(cacheKey);
	return entry
		? {
				revision: entry.revision,
				resetCount: entry.resetCount,
				refCount: entry.refCount,
			}
		: null;
}

function TreeContextMenu({
	actions,
	menuId,
	anchor,
	origin,
	trigger,
	onClose,
}: {
	actions: ShellularTreeAction[];
	menuId: ContextMenuId;
	anchor: { left: number; top: number; right: number; bottom: number };
	origin: HTMLElement;
	trigger: ContextMenuTrigger;
	onClose: () => void;
}) {
	const launched = useRef(false);
	useEffect(() => {
		if (launched.current) return;
		launched.current = true;
		const resolvedTrigger =
			anchor.left === anchor.right && anchor.top === anchor.bottom
				? "context"
				: trigger;
		void showContextMenu({
			menuId,
			anchor: { kind: "rect", ...anchor },
			trigger: resolvedTrigger,
			origin,
			target: {
				handlers: Object.fromEntries(
					actions.map((action) => [
						action.command,
						{
							run: action.onClick,
							enabled: !action.disabled,
							label: action.label,
						},
					]),
				),
			},
		}).finally(onClose);
	}, [actions, anchor, menuId, onClose, origin, trigger]);
	return null;
}

function canonicalPath(path: string, type: "directory" | "file") {
	const normalized = normalizePath(path);
	return type === "directory" ? `${normalized}/` : normalized;
}

function normalizePath(path: string) {
	return path.split("\\").join("/").replace(/^\.\//, "").replace(/\/$/, "");
}

function itemPathFromEvent(event: React.MouseEvent<HTMLElement>) {
	for (const target of event.nativeEvent.composedPath()) {
		if (target instanceof HTMLElement && target.dataset.itemPath) {
			return normalizePath(target.dataset.itemPath);
		}
	}
	return null;
}

function isContextMenuTrigger(target: EventTarget) {
	return (
		target instanceof HTMLElement &&
		target.dataset.type === "context-menu-trigger"
	);
}

const TREE_THEME_STYLE = {
	...TREE_ICON_THEME_STYLE,
	...TREE_GIT_STATUS_STYLE,
	"--trees-bg-override": "var(--workbench-sidebar-background, var(--primary))",
	"--trees-bg-muted-override": "var(--surface-soft)",
	"--trees-fg-override": "var(--primary-text)",
	"--trees-fg-muted-override": "var(--secondary-text)",
	"--trees-selected-bg-override": "var(--surface-strong)",
	"--trees-selected-fg-override": "var(--primary-text)",
	"--trees-border-color-override": "var(--card-border)",
	"--trees-focus-ring-color-override": "var(--accent)",
	"--trees-accent-override": "var(--accent)",
	"--trees-input-bg-override": "var(--surface-soft)",
	"--trees-scrollbar-thumb-override": "var(--scrollbar-thumb)",
	"--trees-font-family-override": "var(--font-family, system-ui)",
	"--trees-font-size-override": "12px",
	"--trees-item-height": "28px",
	"--trees-item-row-gap-override": "6px",
	"--trees-git-lane-width-override": "12px",
	"--trees-item-margin-x-override": "0px",
	"--trees-border-radius-override": "0px",
} as CSSProperties;

const CLOSED_SEARCH_STYLE = `
[data-file-tree-search-container][data-open="false"] {
	display: none;
}
`;

const TREE_UNSAFE_STYLE = `${CLOSED_SEARCH_STYLE}
[data-item-git-status] > [data-item-section="content"] {
	color: var(--trees-fg);
}

[data-item-section="icon"] > :where(:not([data-icon-name="file-tree-icon-chevron"])) {
	color: var(--trees-fg-muted);
}

[data-item-git-status="ignored"] > [data-item-section="icon"] {
	opacity: 1;
}
`;
