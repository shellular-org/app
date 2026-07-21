import dialog from "bridge/dialog";
import native from "bridge/native";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import ContextMenuButton from "context-menu/ContextMenuButton";
import { showContextMenuForEvent } from "context-menu/service";
import { copyToClipboard } from "lib/clipboard";
import { joinRemotePath } from "lib/remotePath";
import { getBranchActionError } from "pages/git-client/branchErrors";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import type {
	GitBranch,
	GitDiffTarget,
	GitOperation,
	GitWorkingTreeFile,
	ProjectInfo,
} from "state";
import { getConnectionSnapshot, getHostInfo } from "state/connection";
import DesktopBranchDialog from "./DesktopBranchDialog";
import { getGitStatusPresentation } from "./gitStatusPresentation";
import type { DesktopGitWorkspace } from "./gitWorkspace";
import {
	NestedPaneHeader,
	PANE_HEADER_CLASS,
	PANE_HEADER_GLYPH_CLASS,
	PANE_HEADER_ICON_CLASS,
	PaneTitleButton,
} from "./PaneHeader";
import { normalizePaneLayout, resizePanePair } from "./paneLayout";
import ResizablePaneStack from "./ResizablePaneStack";
import { ShellularFileIcon } from "./ShellularFileIcon";
import ShellularFileTree, {
	pruneShellularFileTreeCache,
	type ShellularTreeAction,
} from "./ShellularFileTree";
import { openWorkbenchSurface } from "./store";
import { createEditorSurface } from "./surfaces";

function layoutKey(hostId: string) {
	return `shellular:desktop-git-layout:v1:${hostId}`;
}

function readJSON(key: string): unknown {
	try {
		return JSON.parse(localStorage.getItem(key) ?? "{}");
	} catch {
		return {};
	}
}

export default function DesktopGitSidebar({
	workspace,
	focusRequest,
}: {
	workspace: DesktopGitWorkspace;
	focusRequest?: { projectPath: string; id: number };
}) {
	const hostId = getHostInfo()?.id ?? "disconnected";
	const paths = useMemo(
		() => workspace.repositories.map((project) => project.path),
		[workspace.repositories],
	);
	const [layout, setLayout] = useState(() =>
		normalizePaneLayout(paths, readJSON(layoutKey(hostId))),
	);
	const gitTreeCacheKeys = useMemo(
		() =>
			paths.flatMap((path) => [
				`git:${hostId}:${path}:head-to-index`,
				`git:${hostId}:${path}:index-to-worktree`,
			]),
		[hostId, paths],
	);

	useEffect(() => {
		setLayout(normalizePaneLayout(paths, readJSON(layoutKey(hostId))));
	}, [hostId, paths]);

	useEffect(() => {
		if (hostId !== "disconnected") {
			localStorage.setItem(layoutKey(hostId), JSON.stringify(layout));
		}
	}, [hostId, layout]);

	useEffect(() => {
		pruneShellularFileTreeCache("git", gitTreeCacheKeys);
	}, [gitTreeCacheKeys]);

	useEffect(() => {
		if (!focusRequest) return;
		const focusedProjectPath = focusRequest.projectPath;
		setLayout((current) => {
			const pane = current[focusedProjectPath];
			if (!pane) return current;
			return {
				...current,
				[focusedProjectPath]: { ...pane, expanded: true },
			};
		});
		requestAnimationFrame(() => {
			document
				.querySelector(
					`[data-git-repository="${CSS.escape(focusedProjectPath)}"]`,
				)
				?.scrollIntoView({ block: "nearest" });
		});
	}, [focusRequest]);

	if (workspace.repositories.length === 0) {
		return (
			<EmptyState
				mascot="thinking"
				message="No Git repositories"
				description="Open a project containing a Git repository."
			/>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
			<ResizablePaneStack
				items={workspace.repositories.flatMap((project) => {
					const pane = layout[project.path];
					return pane ? [{ id: project.path, project, ...pane }] : [];
				})}
				onResize={(before, after, delta, minimum) =>
					setLayout((current) =>
						resizePanePair(current, before, after, delta, minimum),
					)
				}
				renderPane={({ project, expanded }) => (
					<GitRepositoryPane
						project={project}
						expanded={expanded}
						state={workspace.states[project.path]}
						workspace={workspace}
						onExpanded={(next) =>
							setLayout((current) => ({
								...current,
								[project.path]: { ...current[project.path], expanded: next },
							}))
						}
					/>
				)}
			/>
		</div>
	);
}

function GitRepositoryTitle({
	expanded,
	projectName,
	changeCount,
	onExpanded,
}: {
	expanded: boolean;
	projectName: string;
	changeCount: number;
	onExpanded: () => void;
}) {
	return (
		<PaneTitleButton
			expanded={expanded}
			label={projectName}
			onClick={onExpanded}
			meta={
				changeCount > 0 ? (
					<span className="mr-0.5 shrink-0 rounded-full border border-card-border bg-surface-strong px-1.5 text-[10px] leading-[15px] text-primary-text">
						{changeCount}
					</span>
				) : null
			}
		/>
	);
}

function GitBranchRow({
	branch,
	ahead,
	behind,
	busy,
	onBranch,
	onSync,
}: {
	branch: string;
	ahead: number;
	behind: number;
	busy: GitOperation | null;
	onBranch: () => void;
	onSync: () => void;
}) {
	const syncing = busy === "pull" || busy === "push";
	const syncStatus = [
		behind > 0 ? `↓${behind}` : "",
		ahead > 0 ? `↑${ahead}` : "",
	]
		.filter(Boolean)
		.join(" ");
	return (
		<div className="flex h-7 w-full shrink-0 items-center gap-1 bg-surface-soft/40 px-1.5 text-[11px] text-secondary-text">
			<button
				type="button"
				className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded px-1.5 text-left hover:bg-surface-soft hover:text-primary-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-40"
				onClick={onBranch}
				disabled={Boolean(busy)}
				aria-label={`Switch branch, current branch ${branch}`}
				title={`Switch branch · ${branch}`}
			>
				<span
					className="icon-git-branch shrink-0 text-[12px]"
					aria-hidden="true"
				/>
				<span className="truncate">{branch}</span>
			</button>
			<button
				type="button"
				className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 hover:bg-surface-soft hover:text-primary-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-40"
				onClick={onSync}
				disabled={Boolean(busy)}
				aria-label={`Synchronize ${branch}${syncStatus ? `, ${syncStatus}` : ""}`}
				title="Sync Changes (Pull, then Push)"
			>
				{syncing ? (
					<Loader size={11} mascot={false} />
				) : (
					<span className="icon-refresh-cw text-[11px]" aria-hidden="true" />
				)}
				<span>{syncStatus || "Sync"}</span>
			</button>
		</div>
	);
}

function GitRepositoryPane({
	project,
	expanded,
	state,
	workspace,
	onExpanded,
}: {
	project: ProjectInfo;
	expanded: boolean;
	state: DesktopGitWorkspace["states"][string] | undefined;
	workspace: DesktopGitWorkspace;
	onExpanded: (expanded: boolean) => void;
}) {
	const [message, setMessage] = useState("");
	const [stagedExpanded, setStagedExpanded] = useState(true);
	const [changesExpanded, setChangesExpanded] = useState(true);
	const [branches, setBranches] = useState<GitBranch[]>([]);
	const [showBranches, setShowBranches] = useState(false);
	const [branchesLoading, setBranchesLoading] = useState(false);
	const [branchError, setBranchError] = useState<ReturnType<
		typeof getBranchActionError
	> | null>(null);
	const [activeBranchRef, setActiveBranchRef] = useState<string | null>(null);
	const viewKey = `shellular:desktop-git-view:v1:${project.path}`;
	const [view, setView] = useState<"list" | "tree">(() =>
		localStorage.getItem(viewKey) === "tree" ? "tree" : "list",
	);
	const status = state?.status;
	const staged = status?.files.filter((file) => file.staged) ?? [];
	const changes = status?.files.filter((file) => file.unstaged) ?? [];
	const busy = state?.busy ?? null;

	const selectFileView = (next: "list" | "tree") => {
		setView((current) => {
			if (current === next) return current;
			localStorage.setItem(viewKey, next);
			return next;
		});
	};

	const execute = async (
		operation: GitOperation,
		options: Parameters<DesktopGitWorkspace["run"]>[2] = {},
	) => {
		try {
			return await workspace.run(project.path, operation, options);
		} catch {
			return null;
		}
	};

	const commit = async (push = false) => {
		const clean = message.trim();
		if (!clean || !status?.files.length || busy) return;
		if (staged.length === 0) {
			const files = [...new Set(changes.map((file) => file.path))];
			if (files.length === 0) return;
			const confirmed = await dialog.confirm(
				`No changes are staged. Stage all ${files.length} changed ${files.length === 1 ? "file" : "files"} and commit?`,
				"Stage All and Commit",
			);
			if (!confirmed) return;
			const stagedResult = await execute("stage", { files });
			if (!stagedResult) return;
		}
		const result = await execute("commit", { message: clean });
		if (!result) return;
		setMessage("");
		if (push) await execute("push");
	};

	const loadBranches = async () => {
		setBranchesLoading(true);
		setBranchError(null);
		try {
			const result = await workspace.run(project.path, "branches");
			setBranches(result.branches ?? []);
		} catch (error) {
			setBranchError(getBranchActionError(error, "Couldn't load branches"));
		} finally {
			setBranchesLoading(false);
		}
	};

	const openBranches = () => {
		setShowBranches(true);
		void loadBranches();
	};

	const checkout = async (branch: GitBranch) => {
		if (
			!(await dialog.confirm(
				`Switch to branch "${branch.name}"?`,
				"Switch Branch",
			))
		)
			return;
		setActiveBranchRef(branch.ref);
		try {
			await workspace.run(project.path, "checkout", { branch: branch.ref });
			setShowBranches(false);
			setBranchError(null);
		} catch (error) {
			setBranchError(
				getBranchActionError(
					error,
					`Couldn't switch to ${branch.name}`,
					branch,
				),
			);
		} finally {
			setActiveBranchRef(null);
		}
	};

	const createBranch = async (name: string) => {
		try {
			await workspace.run(project.path, "branch-create", { branch: name });
			setShowBranches(false);
			setBranchError(null);
		} catch (error) {
			setBranchError(getBranchActionError(error, "Couldn't create branch"));
		}
	};

	const deleteBranch = async (branch: GitBranch, force = false) => {
		if (
			!(await dialog.confirm(
				`${force ? "Force delete" : "Delete"} branch "${branch.name}"?`,
				force ? "Force Delete Branch" : "Delete Branch",
			))
		)
			return;
		setActiveBranchRef(branch.ref);
		try {
			await workspace.run(project.path, "branch-delete", {
				branch: branch.name,
				force,
			});
			const result = await workspace.run(project.path, "branches");
			setBranches(result.branches ?? []);
			setBranchError(null);
		} catch (error) {
			setBranchError(
				getBranchActionError(error, `Couldn't delete ${branch.name}`, branch),
			);
		} finally {
			setActiveBranchRef(null);
		}
	};

	const network = async (operation: "fetch" | "pull" | "push") => {
		if (
			operation === "pull" &&
			status?.files.length &&
			!(await dialog.confirm(
				"Pull with local changes? Git may refuse if files conflict.",
				"Pull",
			))
		)
			return;
		await execute(operation);
	};
	const sync = async () => {
		if (
			status?.files.length &&
			!(await dialog.confirm(
				"Sync with local changes? Git may refuse if files conflict.",
				"Sync Changes",
			))
		)
			return;
		const pulled = await execute("pull");
		if (!pulled) return;
		await execute("push");
	};

	const gitMenuTarget = {
		handlers: {
			"git.listView": {
				run: () => selectFileView("list"),
				checked: view === "list",
			},
			"git.treeView": {
				run: () => selectFileView("tree"),
				checked: view === "tree",
			},
			"resource.refresh": {
				run: () => workspace.refresh(project.path),
				enabled: !busy,
			},
			"git.switchBranch": { run: openBranches, enabled: !busy },
			"git.pull": { run: () => network("pull"), enabled: !busy },
			"git.push": { run: () => network("push"), enabled: !busy },
			"git.fetch": { run: () => network("fetch"), enabled: !busy },
			"git.history": { run: () => openHistory(project) },
		},
	};
	const commitDisabledReason = busy
		? "A Git operation is already in progress"
		: !message.trim()
			? "Enter a commit message"
			: !status?.files.length
				? "There are no changes to commit"
				: undefined;
	const commitLabel =
		busy === "stage"
			? "Staging…"
			: busy === "commit"
				? "Committing…"
				: busy === "push"
					? "Pushing…"
					: "Commit";

	return (
		<section
			className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent"
			data-git-repository={project.path}
		>
			<header
				className={PANE_HEADER_CLASS}
				onContextMenu={(event) =>
					void showContextMenuForEvent(event, {
						menuId: "git-repository",
						target: gitMenuTarget,
					})
				}
			>
				<GitRepositoryTitle
					expanded={expanded}
					projectName={project.name}
					changeCount={status?.files.length ?? 0}
					onExpanded={() => onExpanded(!expanded)}
				/>
				<ContextMenuButton
					ariaLabel={`Git menu for ${project.name}`}
					menuId="git-repository"
					target={gitMenuTarget}
					disabled={Boolean(busy)}
					className={PANE_HEADER_ICON_CLASS}
				>
					<span className={`icon-more-horizontal ${PANE_HEADER_GLYPH_CLASS}`} />
				</ContextMenuButton>
			</header>
			{expanded && (
				<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
					<GitBranchRow
						branch={status?.branch ?? "HEAD"}
						ahead={status?.ahead ?? 0}
						behind={status?.behind ?? 0}
						busy={busy}
						onBranch={openBranches}
						onSync={() => void sync()}
					/>
					{state?.loading && !status ? (
						<EmptyState mascot="loading" message="Loading repository…" />
					) : state?.error && !status ? (
						<EmptyState
							mascot="error"
							message={state.error}
							action={
								<button
									type="button"
									onClick={() => void workspace.refresh(project.path)}
								>
									Retry
								</button>
							}
						/>
					) : (
						<>
							<div className="shrink-0 px-2 pb-2 pt-2">
								<textarea
									value={message}
									onChange={(event) => setMessage(event.target.value)}
									placeholder="Message (⌘Enter to commit)"
									className="block min-h-14 w-full resize-y rounded border border-card-border bg-surface-soft px-2 py-1.5 text-xs text-primary-text outline-none focus:border-accent"
									onKeyDown={(event) => {
										if (
											(event.metaKey || event.ctrlKey) &&
											event.key === "Enter"
										)
											void commit();
									}}
								/>
								<div className="mt-1 flex gap-1">
									<button
										type="button"
										className="h-7 flex-1 rounded bg-button-background px-2 text-xs font-semibold text-button-text hover:bg-button-background-active disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-secondary-text"
										disabled={Boolean(commitDisabledReason)}
										onClick={() => void commit()}
										title={commitDisabledReason ?? "Commit changes"}
									>
										{commitLabel}
									</button>
									<button
										type="button"
										className="grid size-7 place-items-center rounded bg-button-background text-button-text hover:bg-button-background-active disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-secondary-text"
										disabled={Boolean(commitDisabledReason)}
										onClick={() => void commit(true)}
										aria-label="Commit and push"
										title={commitDisabledReason ?? "Commit and push"}
									>
										<span className="icon-upload-cloud text-[12px]" />
									</button>
								</div>
							</div>
							{state?.error && (
								<div className="mx-2 mb-1 rounded bg-danger/10 px-2 py-1 text-[11px] text-danger">
									{state.error}
								</div>
							)}
							<div
								className={
									view === "tree"
										? "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
										: "desktop-scroll-area min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
								}
							>
								<ChangeGroup
									title="Staged Changes"
									files={staged}
									expanded={stagedExpanded}
									onExpanded={setStagedExpanded}
									view={view}
									revision={state?.revision ?? 0}
									project={project}
									busy={busy}
									processingPaths={state?.processingPaths ?? new Set()}
									selectedPaths={state?.selectedPaths ?? new Set()}
									selectionTarget={state?.selectionTarget ?? null}
									target="head-to-index"
									onSelect={(target, path, paths, mode) =>
										workspace.select(project.path, target, path, paths, mode)
									}
									onAction={(operation, files) =>
										void execute(operation, { files })
									}
								/>
								<ChangeGroup
									title="Changes"
									files={changes}
									expanded={changesExpanded}
									onExpanded={setChangesExpanded}
									view={view}
									revision={state?.revision ?? 0}
									project={project}
									busy={busy}
									processingPaths={state?.processingPaths ?? new Set()}
									selectedPaths={state?.selectedPaths ?? new Set()}
									selectionTarget={state?.selectionTarget ?? null}
									target="index-to-worktree"
									onSelect={(target, path, paths, mode) =>
										workspace.select(project.path, target, path, paths, mode)
									}
									onAction={(operation, files) =>
										void execute(operation, { files })
									}
								/>
								{status && status.files.length === 0 && (
									<p className="px-3 py-5 text-center text-xs text-secondary-text">
										No changes
									</p>
								)}
							</div>
						</>
					)}
				</div>
			)}
			{showBranches && (
				<DesktopBranchDialog
					activeBranchRef={activeBranchRef}
					branches={branches}
					busy={busy}
					error={branchError}
					loading={branchesLoading}
					onClose={() => setShowBranches(false)}
					onCreate={createBranch}
					onDelete={deleteBranch}
					onDismissError={() => setBranchError(null)}
					onRetry={() => void loadBranches()}
					onSelect={checkout}
				/>
			)}
		</section>
	);
}

function ChangeGroup({
	title,
	files,
	expanded,
	onExpanded,
	view,
	revision,
	project,
	busy,
	processingPaths,
	selectedPaths,
	selectionTarget,
	target,
	onSelect,
	onAction,
}: {
	title: "Staged Changes" | "Changes";
	files: GitWorkingTreeFile[];
	expanded: boolean;
	onExpanded: (expanded: boolean) => void;
	view: "list" | "tree";
	revision: number;
	project: ProjectInfo;
	busy: GitOperation | null;
	processingPaths: Set<string>;
	selectedPaths: Set<string>;
	selectionTarget: GitDiffTarget | null;
	target: GitDiffTarget;
	onSelect: (
		target: GitDiffTarget,
		path: string,
		orderedPaths: string[],
		mode: "replace" | "toggle" | "range",
	) => void;
	onAction: (
		operation: "stage" | "unstage" | "discard",
		files: string[],
	) => void;
}) {
	if (files.length === 0) return null;
	const groupOperation = title === "Staged Changes" ? "unstage" : "stage";
	const orderedPaths = files.map((file) => file.path);
	return (
		<section
			className={
				view === "tree"
					? `flex min-h-0 w-full min-w-0 flex-col overflow-hidden ${expanded ? "flex-1" : "shrink-0"}`
					: "w-full min-w-0"
			}
		>
			<NestedPaneHeader
				expanded={expanded}
				label={title}
				count={files.length}
				onToggle={() => onExpanded(!expanded)}
				onContextMenu={(event) => {
					void showContextMenuForEvent(event, {
						menuId: "git-group",
						target: {
							handlers: {
								"git.stage": {
									run: () => onAction("stage", orderedPaths),
									visible: groupOperation === "stage",
									enabled: !busy,
									label: "Stage All Changes",
								},
								"git.unstage": {
									run: () => onAction("unstage", orderedPaths),
									visible: groupOperation === "unstage",
									enabled: !busy,
									label: "Unstage All Changes",
								},
								"git.discard": {
									run: () => confirmTreeDiscard(files, onAction),
									visible: groupOperation === "stage",
									enabled: !busy,
									label: "Discard All Changes",
								},
							},
						},
					});
				}}
				action={
					<button
						type="button"
						className={`${PANE_HEADER_ICON_CLASS} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
						onClick={() =>
							onAction(
								groupOperation,
								files.map((file) => file.path),
							)
						}
						disabled={Boolean(busy)}
						aria-label={`${groupOperation === "stage" ? "Stage" : "Unstage"} all ${title}`}
						title={`${groupOperation === "stage" ? "Stage" : "Unstage"} all ${title}`}
					>
						<span
							className={`${groupOperation === "stage" ? "icon-plus" : "icon-minus"} ${PANE_HEADER_GLYPH_CLASS}`}
							aria-hidden="true"
						/>
					</button>
				}
			/>
			{expanded &&
				(view === "tree" ? (
					<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
						<GitTreeView
							files={files}
							cacheKey={`git:${getHostInfo()?.id ?? "local"}:${project.path}:${target}`}
							revision={revision}
							project={project}
							target={target}
							busy={busy}
							orderedPaths={orderedPaths}
							onSelect={onSelect}
							onAction={onAction}
							groupOperation={groupOperation}
						/>
					</div>
				) : (
					<div className="w-full min-w-0">
						{files.map((file) => (
							<GitFileRow
								key={file.path}
								file={file}
								depth={0}
								project={project}
								target={target}
								busy={busy}
								processing={processingPaths.has(file.path)}
								selected={
									selectionTarget === target && selectedPaths.has(file.path)
								}
								selectedPaths={selectedPaths}
								orderedPaths={orderedPaths}
								onSelect={onSelect}
								onAction={onAction}
								groupOperation={groupOperation}
							/>
						))}
					</div>
				))}
		</section>
	);
}

function GitTreeView({
	files,
	cacheKey,
	revision,
	project,
	target,
	busy,
	orderedPaths,
	onSelect,
	onAction,
	groupOperation,
}: {
	files: GitWorkingTreeFile[];
	cacheKey: string;
	revision: number;
	project: ProjectInfo;
	target: GitDiffTarget;
	busy: GitOperation | null;
	orderedPaths: string[];
	onSelect: (
		target: GitDiffTarget,
		path: string,
		orderedPaths: string[],
		mode: "replace" | "toggle" | "range",
	) => void;
	onAction: (
		operation: "stage" | "unstage" | "discard",
		files: string[],
	) => void;
	groupOperation: "stage" | "unstage";
}) {
	const byPath = new Map(files.map((file) => [file.path, file]));
	const openDiff = (file: GitWorkingTreeFile) =>
		openWorkbenchSurface(
			createEditorSurface({
				filePath: joinRemotePath(project.path, file.path),
				gitStatus: file.status,
				comparison: {
					kind: "working-tree",
					projectPath: project.path,
					relativePath: file.path,
					target,
				},
			}),
		);
	const descendants = (path: string) =>
		files.filter(
			(file) => file.path === path || file.path.startsWith(`${path}/`),
		);
	return (
		<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
			<ShellularFileTree
				ariaLabel={`${target === "head-to-index" ? "Staged" : "Unstaged"} changes`}
				cacheKey={cacheKey}
				revision={revision}
				initialExpansion="open"
				contextMenuIdForItem={() => "git-change"}
				entries={files.map((file) => ({
					path: file.path,
					type: "file",
					gitStatus: file.status,
				}))}
				onActivate={(path) => {
					const file = byPath.get(path);
					if (!file) return;
					onSelect(target, file.path, orderedPaths, "replace");
					openDiff(file);
				}}
				actionsForItem={(path, type, selectedPaths) => {
					const affected =
						selectedPaths.length > 1
							? files.filter((entry) =>
									selectedPaths.some(
										(selected) =>
											entry.path === selected ||
											entry.path.startsWith(`${selected}/`),
									),
								)
							: descendants(path);
					const file = type === "file" ? byPath.get(path) : undefined;
					const paths = affected.map((entry) => entry.path);
					const actions: ShellularTreeAction[] = [
						...(file
							? [
									{
										command: "git.openChanges",
										label: "Open Changes",
										icon: "icon-git-branch",
										onClick: () => openDiff(file),
									},
								]
							: []),
						{
							command: groupOperation === "stage" ? "git.stage" : "git.unstage",
							label: groupOperation === "stage" ? "Stage" : "Unstage",
							icon: groupOperation === "stage" ? "icon-plus" : "icon-minus",
							disabled: Boolean(busy),
							onClick: () => onAction(groupOperation, paths),
						},
					];
					if (groupOperation === "stage") {
						actions.push({
							command: "git.discard",
							label: "Discard Changes",
							icon: "icon-rotate-ccw",
							danger: true,
							disabled: Boolean(busy),
							onClick: () => void confirmTreeDiscard(affected, onAction),
						});
					}
					if (file && file.status !== "deleted") {
						actions.push({
							command: "resource.open",
							label: "Open File",
							icon: "icon-file-text",
							disabled: false,
							onClick: () =>
								openWorkbenchSurface(
									createEditorSurface({
										filePath: joinRemotePath(project.path, file.path),
									}),
								),
						});
					}
					actions.push(
						{
							command: "resource.copyPath",
							label: "Copy Path",
							icon: "icon-copy",
							onClick: () =>
								copyToClipboard({ text: joinRemotePath(project.path, path) }),
						},
						{
							command: "resource.copyRelativePath",
							label: "Copy Relative Path",
							icon: "icon-copy",
							onClick: () => copyToClipboard({ text: path }),
						},
					);
					if (getConnectionSnapshot().transport === "local")
						actions.push({
							command: "resource.reveal",
							label: "Reveal in Finder",
							icon: "icon-external-link",
							onClick: () =>
								native.revealLocalPath(joinRemotePath(project.path, path)),
						});
					return actions;
				}}
			/>
		</div>
	);
}

async function confirmTreeDiscard(
	files: GitWorkingTreeFile[],
	onAction: (
		operation: "stage" | "unstage" | "discard",
		files: string[],
	) => void,
) {
	const paths = files.map((file) => file.path);
	const untracked = files.filter((file) => file.untracked).length;
	const confirmed = await dialog.confirm(
		paths.length === 1
			? untracked
				? `Permanently delete the untracked file "${paths[0]}"? This cannot be undone.`
				: `Discard all changes in "${paths[0]}"? This cannot be undone.`
			: `Discard ${paths.length} files?${untracked ? ` ${untracked} untracked ${untracked === 1 ? "file will" : "files will"} be permanently deleted.` : ""} This cannot be undone.`,
		"Discard Changes",
	);
	if (confirmed) onAction("discard", paths);
}

function GitFileRow({
	file,
	depth,
	project,
	target,
	busy,
	processing,
	selected,
	selectedPaths,
	orderedPaths,
	onSelect,
	onAction,
	groupOperation,
}: {
	file: GitWorkingTreeFile;
	depth: number;
	project: ProjectInfo;
	target: GitDiffTarget;
	busy: GitOperation | null;
	processing: boolean;
	selected: boolean;
	selectedPaths: Set<string>;
	orderedPaths: string[];
	onSelect: (
		target: GitDiffTarget,
		path: string,
		orderedPaths: string[],
		mode: "replace" | "toggle" | "range",
	) => void;
	onAction: (
		operation: "stage" | "unstage" | "discard",
		files: string[],
	) => void;
	groupOperation: "stage" | "unstage";
}) {
	const absolutePath = joinRemotePath(project.path, file.path);
	const status = getGitStatusPresentation(file.status);
	const actionPaths = selected ? [...selectedPaths] : [file.path];
	const actionWidth =
		20 *
		(1 +
			Number(groupOperation === "stage") +
			Number(file.status !== "deleted"));
	const openDiff = () =>
		openWorkbenchSurface(
			createEditorSurface({
				filePath: absolutePath,
				gitStatus: file.status,
				comparison: {
					kind: "working-tree",
					projectPath: project.path,
					relativePath: file.path,
					target,
				},
			}),
		);
	const discard = async () => {
		if (actionPaths.length > 1) {
			const confirmed = await dialog.confirm(
				`Discard ${actionPaths.length} selected files? Untracked files will be permanently deleted. This cannot be undone.`,
				"Discard Selected Changes",
			);
			if (confirmed) onAction("discard", actionPaths);
			return;
		}
		const permanent = file.untracked;
		const confirmed = await dialog.confirm(
			permanent
				? `Permanently delete the untracked file "${file.path}"? This cannot be undone.`
				: `Discard all changes in "${file.path}"? This cannot be undone.`,
			permanent ? "Delete Untracked File" : "Discard Changes",
		);
		if (confirmed) onAction("discard", actionPaths);
	};
	const selectFile = (event: MouseEvent<HTMLButtonElement>) => {
		const mode = event.shiftKey
			? "range"
			: event.metaKey || event.ctrlKey
				? "toggle"
				: "replace";
		onSelect(target, file.path, orderedPaths, mode);
		if (mode === "replace") openDiff();
	};
	return (
		<div
			className={`group flex h-7 w-full min-w-0 items-center text-xs hover:bg-surface-soft focus-within:bg-surface-soft ${selected ? "bg-surface-strong" : ""}`}
			onContextMenu={(event) => {
				if (!selected) onSelect(target, file.path, orderedPaths, "replace");
				void showContextMenuForEvent(event, {
					menuId: "git-change",
					target: {
						handlers: {
							"git.openChanges": { run: openDiff },
							"resource.open": {
								run: () =>
									openWorkbenchSurface(
										createEditorSurface({ filePath: absolutePath }),
									),
								visible: file.status !== "deleted",
							},
							"git.stage": {
								run: () => onAction("stage", actionPaths),
								visible: groupOperation === "stage",
								enabled: !busy,
							},
							"git.unstage": {
								run: () => onAction("unstage", actionPaths),
								visible: groupOperation === "unstage",
								enabled: !busy,
							},
							"git.discard": {
								run: discard,
								visible: groupOperation === "stage",
								enabled: !busy,
							},
							"resource.copyPath": {
								run: () => copyToClipboard({ text: absolutePath }),
							},
							"resource.copyRelativePath": {
								run: () => copyToClipboard({ text: file.path }),
							},
							"resource.reveal": {
								run: () => native.revealLocalPath(absolutePath),
								visible: getConnectionSnapshot().transport === "local",
							},
						},
					},
				});
			}}
		>
			<button
				type="button"
				className="flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-hidden pr-1 text-left text-primary-text"
				style={{ paddingLeft: 8 + depth * 12 }}
				onClick={selectFile}
				title={file.path}
			>
				<ShellularFileIcon
					path={file.path}
					className="size-4 shrink-0"
					color="var(--secondary-text)"
				/>
				<span className="min-w-0 truncate">{file.path.split("/").pop()}</span>
			</button>
			<div
				className="flex shrink-0 items-center justify-center"
				style={{ width: actionWidth }}
			>
				{processing ? (
					<Loader size={12} mascot={false} />
				) : (
					<div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
						<button
							type="button"
							className="grid size-5 place-items-center rounded text-secondary-text hover:bg-popup-background hover:text-primary-text disabled:opacity-40"
							onClick={() => onAction(groupOperation, actionPaths)}
							disabled={Boolean(busy)}
							aria-label={`${groupOperation} ${file.path}`}
							title={groupOperation}
						>
							<span
								className={
									groupOperation === "stage" ? "icon-plus" : "icon-minus"
								}
							/>
						</button>
						{groupOperation === "stage" && (
							<button
								type="button"
								className="grid size-5 place-items-center rounded text-secondary-text hover:bg-popup-background hover:text-danger disabled:opacity-40"
								onClick={() => void discard()}
								disabled={Boolean(busy)}
								aria-label={`Discard ${file.path}`}
								title="Discard changes"
							>
								<span className="icon-rotate-ccw" />
							</button>
						)}
						{file.status !== "deleted" && (
							<button
								type="button"
								className="grid size-5 place-items-center rounded text-secondary-text hover:bg-popup-background hover:text-primary-text"
								onClick={() =>
									openWorkbenchSurface(
										createEditorSurface({ filePath: absolutePath }),
									)
								}
								aria-label={`Open file ${file.path}`}
								title="Open file"
							>
								<span className="icon-file-text" />
							</button>
						)}
					</div>
				)}
			</div>
			<span
				className="mr-1 grid w-3 shrink-0 place-items-center text-xs font-semibold leading-none"
				style={{ color: status.color }}
				role="img"
				aria-label={status.title}
				title={status.title}
			>
				{status.label}
			</span>
		</div>
	);
}

function openHistory(project: ProjectInfo) {
	openWorkbenchSurface({
		kind: "git",
		id: `git:${project.path}`,
		title: `${project.name} · History`,
		icon: "icon-git-branch",
		projectPath: project.path,
		projectName: project.name,
	});
}
