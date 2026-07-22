import dialog from "bridge/dialog";
import native from "bridge/native";
import type { AppMenuItem } from "components/AppMenu";
import Loader from "components/Loader";
import { copyToClipboard } from "lib/clipboard";
import { joinRemotePath } from "lib/remotePath";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { GitWorkingTreeStatus, ProjectInfo } from "state";
import { getConnectionSnapshot, getHostInfo } from "state/connection";
import {
	createDir,
	deleteEntry,
	type FileEntry,
	renameEntry,
	searchProjectFiles,
	writeFile,
} from "state/filesystem";
import { tryOpenEditorSurface } from "./openers";
import { deriveProjectTreeGitStatus } from "./projectTreeGitStatus";
import {
	applyProjectTreeMutation,
	ensureProjectDirectory,
	getProjectTreeSnapshot,
	hydrateProjectTreeSearchResults,
	type ProjectTreeMutation,
	refreshProjectDirectory,
	refreshProjectExplorer,
	subscribeProjectTree,
} from "./projectTreeWorkspace";
import ShellularFileTree, {
	type ShellularFileTreeModel,
} from "./ShellularFileTree";

export default function ProjectExplorerTree({
	project,
	refreshToken,
	searchToken,
	gitStatus,
}: {
	project: ProjectInfo;
	refreshToken: number;
	searchToken: number;
	gitStatus?: GitWorkingTreeStatus | null;
}) {
	const isLocal = getConnectionSnapshot().transport === "local";
	const subscribe = useCallback(
		(listener: () => void) => subscribeProjectTree(project.path, listener),
		[project.path],
	);
	const getSnapshot = useCallback(
		() => getProjectTreeSnapshot(project.path),
		[project.path],
	);
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const refreshExplorer = useCallback(
		() => void refreshProjectExplorer(project.path),
		[project.path],
	);
	const treeModel = useRef<ShellularFileTreeModel | null>(null);
	const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const searchController = useRef<AbortController | null>(null);
	const searchGeneration = useRef(0);
	const [searchCompatibility, setSearchCompatibility] = useState(false);
	const lastRefreshToken = useRef(refreshToken);
	const lastSearchToken = useRef(searchToken);
	const attachTreeModel = useCallback(
		(model: ShellularFileTreeModel | null) => {
			treeModel.current = model;
			if (!model || lastSearchToken.current === searchToken) return;
			lastSearchToken.current = searchToken;
			model.openSearch();
		},
		[searchToken],
	);
	const onChanged = useCallback(
		(mutation?: AbsoluteProjectTreeMutation) => {
			if (!mutation) {
				refreshExplorer();
				return;
			}
			const relativeMutation = toRelativeMutation(project.path, mutation);
			const revision = applyProjectTreeMutation(project.path, relativeMutation);
			applyModelMutation(treeModel.current, relativeMutation, revision);
		},
		[project.path, refreshExplorer],
	);
	const refreshEntry = useCallback(
		(relativePath: string, type: "directory" | "file") => {
			const directory =
				type === "directory" ? relativePath : relativeParent(relativePath);
			void refreshProjectDirectory(project.path, directory);
		},
		[project.path],
	);
	const loadDirectory = useCallback(
		(relativePath: string) => {
			void ensureProjectDirectory(project.path, relativePath, {
				priority: "user",
			});
		},
		[project.path],
	);
	const search = useCallback(
		(value: string | null) => {
			if (searchTimer.current) clearTimeout(searchTimer.current);
			searchController.current?.abort();
			const generation = ++searchGeneration.current;
			const query = value?.trim() ?? "";
			if (!query) {
				hydrateProjectTreeSearchResults(project.path, []);
				setSearchCompatibility(false);
				return;
			}
			searchTimer.current = setTimeout(() => {
				const controller = new AbortController();
				searchController.current = controller;
				void searchProjectFiles(project.path, query, {
					limit: 200,
					request: { timeoutMs: 15_000, signal: controller.signal },
				})
					.then((result) => {
						if (searchGeneration.current !== generation) return;
						hydrateProjectTreeSearchResults(project.path, result.entries);
						setSearchCompatibility(false);
					})
					.catch(() => {
						if (searchGeneration.current !== generation) return;
						setSearchCompatibility(true);
					});
			}, 150);
		},
		[project.path],
	);

	useEffect(() => {
		void ensureProjectDirectory(project.path, "", { priority: "background" });
	}, [project.path]);

	useEffect(
		() => () => {
			if (searchTimer.current) clearTimeout(searchTimer.current);
			searchController.current?.abort();
		},
		[],
	);

	useEffect(() => {
		if (lastRefreshToken.current === refreshToken) return;
		lastRefreshToken.current = refreshToken;
		void refreshProjectExplorer(project.path);
	}, [project.path, refreshToken]);

	useEffect(() => {
		if (lastSearchToken.current === searchToken || !treeModel.current) return;
		lastSearchToken.current = searchToken;
		treeModel.current.openSearch();
	}, [searchToken]);

	const gitDecorations = useMemo(
		() => deriveProjectTreeGitStatus(gitStatus, project.path),
		[gitStatus, project.path],
	);
	const entries = useMemo(
		() =>
			snapshot.entries.map((entry) => ({
				path: entry.relativePath,
				type: entry.type,
				gitStatus: gitDecorations.get(entry.relativePath) ?? entry.gitStatus,
			})),
		[gitDecorations, snapshot.entries],
	);
	const entryByPath = snapshot.entryByPath;
	const root = snapshot.directories.get("");
	const loadingDirectories = [...snapshot.directories.entries()].filter(
		([path, state]) => path && state.status === "loading",
	);
	const failedDirectory = [...snapshot.directories.entries()].find(
		([path, state]) => path && state.status === "error",
	);

	if ((!root || root.status === "loading") && entries.length === 0) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-xs text-secondary-text">
				<Loader size={14} /> Loading {project.name}…
			</div>
		);
	}
	if (root?.status === "error" && entries.length === 0) {
		return (
			<button
				type="button"
				className="m-2 rounded-md border border-danger/30 bg-danger/10 px-2 py-2 text-left text-xs text-danger"
				onClick={refreshExplorer}
			>
				{root.error} · Retry
			</button>
		);
	}
	if (entries.length === 0) {
		return (
			<p className="m-0 px-3 py-2 text-xs text-secondary-text">Empty folder</p>
		);
	}

	return (
		<div className="relative flex h-full min-h-0 flex-col">
			<ShellularFileTree
				ariaLabel={`${project.name} Explorer`}
				cacheKey={`project:${getHostInfo()?.id ?? "local"}:${project.path}`}
				revision={snapshot.revision}
				entries={entries}
				presorted
				incremental
				onRetry={refreshExplorer}
				onModel={attachTreeModel}
				onDirectoryExpand={loadDirectory}
				onSearchChange={search}
				onActivate={(relativePath) => {
					const entry = entryByPath.get(relativePath);
					if (!entry || entry.type !== "file") return;
					const filePath = joinRemotePath(project.path, relativePath);
					tryOpenEditorSurface({
						id: `editor:${filePath}`,
						filePath,
						title: relativePath.split("/").pop(),
						gitStatus: gitDecorations.get(relativePath) ?? entry.gitStatus,
					});
				}}
				actionsForItem={(relativePath, type) => {
					const name = relativePath.split("/").pop() || relativePath;
					const absolutePath = joinRemotePath(project.path, relativePath);
					const open = () => {
						if (type !== "file") return;
						tryOpenEditorSurface({
							id: `editor:${absolutePath}`,
							filePath: absolutePath,
							title: name,
							gitStatus:
								gitDecorations.get(relativePath) ??
								entryByPath.get(relativePath)?.gitStatus,
						});
					};
					const entries = buildEntryMenu(
						{ name, type, size: 0, modified: 0 },
						absolutePath,
						isLocal,
						onChanged,
						() => refreshEntry(relativePath, type),
					);
					return [
						...(type === "file"
							? [
									{
										command: "resource.open",
										label: "Open",
										icon: "icon-file-text",
										onClick: open,
									},
								]
							: []),
						...entries.map((item) => ({
							command: projectEntryCommand(item.label),
							label: item.label,
							icon: item.icon,
							danger: item.danger,
							disabled: item.disabled,
							onClick: item.onClick,
						})),
						{
							command: "resource.copyPath",
							label: "Copy Path",
							icon: "icon-copy",
							onClick: () => copyToClipboard({ text: absolutePath }),
						},
						{
							command: "resource.copyRelativePath",
							label: "Copy Relative Path",
							icon: "icon-copy",
							onClick: () => copyToClipboard({ text: relativePath }),
						},
					];
				}}
			/>
			{loadingDirectories.length > 0 && (
				<div
					className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded bg-popup-background/90 px-2 py-1 text-[11px] text-secondary-text shadow"
					role="status"
				>
					<Loader size={12} /> Loading {basename(loadingDirectories[0][0])}…
				</div>
			)}
			{failedDirectory && (
				<button
					type="button"
					className="absolute bottom-2 left-2 right-2 rounded border border-danger/30 bg-popup-background/95 px-2 py-1.5 text-left text-[11px] text-danger shadow"
					onClick={() =>
						void refreshProjectDirectory(project.path, failedDirectory[0])
					}
				>
					Couldn’t load {basename(failedDirectory[0])}:{" "}
					{failedDirectory[1].error}· Retry
				</button>
			)}
			{searchCompatibility && (
				<p className="absolute bottom-2 left-2 right-2 m-0 rounded bg-popup-background/95 px-2 py-1.5 text-[11px] text-secondary-text shadow">
					Global search needs a newer CLI. Showing loaded folders only.
				</p>
			)}
		</div>
	);
}

function projectEntryCommand(label: string) {
	const commands: Record<string, string> = {
		"New File": "resource.newFile",
		"New Folder": "resource.newFolder",
		Rename: "resource.rename",
		"Reveal in Finder": "resource.reveal",
		Refresh: "resource.refresh",
		Delete: "resource.delete",
	};
	return commands[label] ?? `project.${label.toLowerCase().replace(/ /g, "-")}`;
}

function buildEntryMenu(
	entry: FileEntry,
	path: string,
	isLocal: boolean,
	onChanged: (mutation?: AbsoluteProjectTreeMutation) => void,
	onRefresh: () => void,
): AppMenuItem[] {
	const directoryItems: AppMenuItem[] =
		entry.type === "directory"
			? [
					{
						icon: "icon-file-plus",
						label: "New File",
						onClick: () => void createProjectChild(path, "file", onChanged),
					},
					{
						icon: "icon-folder-plus",
						label: "New Folder",
						onClick: () =>
							void createProjectChild(path, "directory", onChanged),
					},
				]
			: [];
	return [
		...directoryItems,
		{
			icon: "icon-edit-2",
			label: "Rename",
			divider: directoryItems.length > 0,
			onClick: () => void renamePath(path, entry.name, entry.type, onChanged),
		},
		...(isLocal
			? [
					{
						icon: "icon-external-link",
						label: "Reveal in Finder",
						onClick: () => void native.revealLocalPath(path),
					} satisfies AppMenuItem,
				]
			: []),
		{
			icon: "icon-refresh-cw",
			label: "Refresh",
			onClick: onRefresh,
		},
		{
			icon: "icon-trash",
			label: "Delete",
			divider: true,
			danger: true,
			onClick: () => void deletePath(path, entry.name, entry.type, onChanged),
		},
	];
}

export async function createProjectChild(
	parentPath: string,
	type: "file" | "directory",
	onChanged: (mutation?: AbsoluteProjectTreeMutation) => void,
) {
	const label = type === "file" ? "file" : "folder";
	const name = await dialog.textInput(
		`Enter a name for the new ${label}.`,
		"",
		`New ${label === "file" ? "File" : "Folder"}`,
	);
	if (name === null) return;
	const clean = name.trim();
	if (!clean || clean === "." || clean === ".." || /[\\/]/.test(clean)) {
		await dialog.message(
			"Use a single valid name without path separators.",
			"Invalid Name",
		);
		return;
	}
	try {
		const path = joinRemotePath(parentPath, clean);
		if (type === "directory") await createDir(path);
		else await writeFile(path, "");
		onChanged({ type: "add", path, entryType: type });
	} catch (error) {
		onChanged();
		await dialog.message(
			(error as Error).message,
			`Unable to Create ${label === "file" ? "File" : "Folder"}`,
		);
	}
}

async function renamePath(
	path: string,
	currentName: string,
	entryType: "file" | "directory",
	onChanged: (mutation?: AbsoluteProjectTreeMutation) => void,
) {
	const next = await dialog.textInput(
		"Enter a new name.",
		currentName,
		"Rename",
	);
	if (next === null || next.trim() === currentName) return;
	const clean = next.trim();
	if (!clean || clean === "." || clean === ".." || /[\\/]/.test(clean)) {
		await dialog.message(
			"Use a single valid name without path separators.",
			"Invalid Name",
		);
		return;
	}
	try {
		const nextPath = joinRemotePath(parentPath(path), clean);
		await renameEntry(path, nextPath);
		onChanged({
			type: "move",
			fromPath: path,
			toPath: nextPath,
			entryType,
		});
	} catch (error) {
		onChanged();
		await dialog.message((error as Error).message, "Unable to Rename");
	}
}

async function deletePath(
	path: string,
	name: string,
	entryType: "file" | "directory",
	onChanged: (mutation?: AbsoluteProjectTreeMutation) => void,
) {
	if (
		!(await dialog.confirm(
			`Delete "${name}" permanently? This cannot be undone.`,
			"Delete",
		))
	)
		return;
	try {
		await deleteEntry(path);
		onChanged({ type: "remove", path, entryType });
	} catch (error) {
		onChanged();
		await dialog.message((error as Error).message, "Unable to Delete");
	}
}

function parentPath(path: string) {
	const separator = path.includes("\\") ? "\\" : "/";
	const index = path.lastIndexOf(separator);
	return index <= 0 ? separator : path.slice(0, index);
}

function relativeParent(path: string) {
	const index = path.lastIndexOf("/");
	return index < 0 ? "" : path.slice(0, index);
}

function basename(path: string) {
	return path.slice(path.lastIndexOf("/") + 1) || "folder";
}

type AbsoluteProjectTreeMutation =
	| { type: "add"; path: string; entryType: "file" | "directory" }
	| {
			type: "move";
			fromPath: string;
			toPath: string;
			entryType: "file" | "directory";
	  }
	| { type: "remove"; path: string; entryType: "file" | "directory" };

function toRelativeMutation(
	projectPath: string,
	mutation: AbsoluteProjectTreeMutation,
): ProjectTreeMutation {
	const relative = (path: string) => {
		const root = projectPath.split("\\").join("/").replace(/\/$/, "");
		const absolute = path.split("\\").join("/");
		return absolute.startsWith(`${root}/`)
			? absolute.slice(root.length + 1)
			: absolute;
	};
	if (mutation.type === "move") {
		return {
			...mutation,
			fromPath: relative(mutation.fromPath),
			toPath: relative(mutation.toPath),
		};
	}
	return { ...mutation, path: relative(mutation.path) };
}

function applyModelMutation(
	model: ShellularFileTreeModel | null,
	mutation: ProjectTreeMutation,
	revision?: number,
) {
	if (!model) return;
	if (mutation.type === "add") {
		model.add(mutation.path, mutation.entryType, revision);
	} else if (mutation.type === "move") {
		model.move(
			mutation.fromPath,
			mutation.toPath,
			mutation.entryType,
			revision,
		);
	} else {
		model.remove(mutation.path, mutation.entryType, revision);
	}
}
