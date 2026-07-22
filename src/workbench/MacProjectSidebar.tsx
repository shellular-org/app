import dialog from "bridge/dialog";
import type { AppMenuItem } from "components/AppMenu";
import EmptyState from "components/EmptyState";
import ContextMenuButton from "context-menu/ContextMenuButton";
import { showContextMenuForEvent } from "context-menu/service";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type ProjectInfo, useShellular } from "state";
import { getHostInfo } from "state/connection";
import { focusDesktopGit } from "./desktopGitNavigation";
import type { DesktopGitRepositoryState } from "./gitWorkspace";
import {
	type WorkspaceCapabilities,
	workspaceIntegration,
} from "./integration";
import { requestNewChat } from "./newChat";
import {
	PANE_HEADER_CLASS,
	PANE_HEADER_GLYPH_CLASS,
	PANE_HEADER_ICON_CLASS,
	PaneSegmentedControl,
	PaneTitleButton,
} from "./PaneHeader";
import ProjectExplorerTree, { createProjectChild } from "./ProjectExplorerTree";
import ProjectSessionsPanel from "./ProjectSessionsPanel";
import {
	normalizeProjectLayout,
	type ProjectLayoutState,
	type ProjectPaneMode,
	resizePanePair,
} from "./projectLayout";
import { pruneProjectTreeWorkspace } from "./projectTreeWorkspace";
import { buildProjectViewMenuItems } from "./projectViewMenu";
import ResizablePaneStack from "./ResizablePaneStack";
import { pruneShellularFileTreeCache } from "./ShellularFileTree";
import { openWorkbenchSurface } from "./store";

export function desktopProjectLayoutKey(hostId: string) {
	return `shellular:desktop-project-layout:v1:${hostId}`;
}

export function readDesktopProjectLayout(hostId: string) {
	try {
		const stored =
			localStorage.getItem(desktopProjectLayoutKey(hostId)) ??
			localStorage.getItem(`shellular:mac-project-layout:v1:${hostId}`) ??
			"{}";
		return JSON.parse(stored);
	} catch {
		return {};
	}
}

export default function DesktopProjectSidebar({
	gitStates = {},
}: {
	gitStates?: Record<string, DesktopGitRepositoryState>;
}) {
	const { connectionStatus, projects, loadingProjects } = useShellular();
	const hostId = getHostInfo()?.id ?? "disconnected";
	const paths = useMemo(
		() => projects.map((project) => project.path),
		[projects],
	);
	const projectTreeCacheKeys = useMemo(
		() => paths.map((path) => `project:${hostId}:${path}`),
		[hostId, paths],
	);
	const [layout, setLayout] = useState<ProjectLayoutState>(() =>
		normalizeProjectLayout(paths, readDesktopProjectLayout(hostId)),
	);
	useEffect(() => {
		setLayout(normalizeProjectLayout(paths, readDesktopProjectLayout(hostId)));
	}, [hostId, paths]);

	useEffect(() => {
		if (hostId === "disconnected") return;
		localStorage.setItem(
			desktopProjectLayoutKey(hostId),
			JSON.stringify(layout),
		);
	}, [hostId, layout]);

	useEffect(() => {
		pruneShellularFileTreeCache("project", projectTreeCacheKeys);
		pruneProjectTreeWorkspace(paths);
	}, [projectTreeCacheKeys, paths]);

	if (connectionStatus !== "connected") {
		return <EmptyState mascot="sleep" message="Connect to browse projects" />;
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			{loadingProjects ? (
				<EmptyState mascot="loading" message="Loading…" />
			) : projects.length === 0 ? (
				<EmptyState
					mascot="greeting"
					message="No projects yet"
					description="Use File → Open Folder to add one to the workspace."
				/>
			) : (
				<ResizablePaneStack
					items={projects.flatMap((project) => {
						const state = layout[project.path];
						return state ? [{ id: project.path, project, ...state }] : [];
					})}
					onResize={(beforePath, afterPath, deltaWeight, minimumWeight) =>
						setLayout((current) =>
							resizePanePair(
								current,
								beforePath,
								afterPath,
								deltaWeight,
								minimumWeight,
							),
						)
					}
					renderPane={({ project, ...state }) => (
						<DesktopProjectPane
							project={project}
							gitStatus={gitStates[project.path]?.status}
							state={state}
							onExpanded={(expanded) =>
								setLayout((current) => ({
									...current,
									[project.path]: { ...current[project.path], expanded },
								}))
							}
							onMode={(mode) =>
								setLayout((current) => ({
									...current,
									[project.path]: { ...current[project.path], mode },
								}))
							}
						/>
					)}
				/>
			)}
		</div>
	);
}

export function DesktopProjectPane({
	project,
	gitStatus,
	state,
	onExpanded,
	onMode,
}: {
	project: ProjectInfo;
	gitStatus?: DesktopGitRepositoryState["status"];
	state: ProjectLayoutState[string];
	onExpanded: (expanded: boolean) => void;
	onMode: (mode: ProjectPaneMode) => void;
}) {
	const [treeRefreshToken, setTreeRefreshToken] = useState(0);
	const [treeSearchToken, setTreeSearchToken] = useState(0);
	const [sessionsRefreshToken, setSessionsRefreshToken] = useState(0);
	const [mountedModes, setMountedModes] = useState<Set<ProjectPaneMode>>(
		() => new Set(state.expanded ? [state.mode] : []),
	);
	useEffect(() => {
		if (!state.expanded) return;
		setMountedModes((current) => {
			if (current.has(state.mode)) return current;
			return new Set([...current, state.mode]);
		});
	}, [state.expanded, state.mode]);
	const refreshTree = useCallback(
		() => setTreeRefreshToken((value) => value + 1),
		[],
	);
	const refreshSessions = useCallback(
		() => setSessionsRefreshToken((value) => value + 1),
		[],
	);
	const searchTree = useCallback(() => {
		if (!state.expanded) onExpanded(true);
		setTreeSearchToken((value) => value + 1);
	}, [onExpanded, state.expanded]);
	const menuItems = useProjectMenu(
		project,
		state.mode,
		searchTree,
		refreshTree,
		refreshSessions,
	);
	const menuCommands = menuItems.map((item) => ({
		item,
		command: projectMenuCommand(item.label),
	}));
	const menuTarget = {
		handlers: Object.fromEntries(
			menuCommands.map(({ item, command }) => [
				command,
				{
					run: item.onClick,
					enabled: !item.disabled,
					visible: !item.comingSoon,
					label: item.label,
					checked: item.checked,
				},
			]),
		),
	};
	const commandGroups = menuCommands.reduce<string[][]>((groups, entry) => {
		if (groups.length === 0 || entry.item.divider) groups.push([]);
		groups[groups.length - 1]?.push(entry.command);
		return groups;
	}, []);
	const treeMounted =
		mountedModes.has("tree") || (state.expanded && state.mode === "tree");
	const sessionsMounted =
		mountedModes.has("sessions") ||
		(state.expanded && state.mode === "sessions");
	return (
		<section className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
			<header
				className={`sticky top-0 z-10 ${PANE_HEADER_CLASS}`}
				onContextMenu={(event) =>
					void showContextMenuForEvent(event, {
						menuId: "project-pane",
						commandGroups,
						target: menuTarget,
					})
				}
			>
				<PaneTitleButton
					expanded={state.expanded}
					label={project.name}
					onClick={() => onExpanded(!state.expanded)}
				/>
				{state.expanded && (
					<PaneSegmentedControl
						label={`${project.name} view`}
						value={state.mode}
						onChange={onMode}
						options={[
							{
								value: "tree",
								icon: "icon-account_tree",
								label: "Project tree",
							},
							{
								value: "sessions",
								icon: "icon-ai-chat",
								label: "Sessions",
							},
						]}
					/>
				)}
				<ContextMenuButton
					ariaLabel={`Menu for ${project.name}`}
					menuId="project-pane"
					commandGroups={commandGroups}
					target={menuTarget}
					className={PANE_HEADER_ICON_CLASS}
				>
					<span className={`icon-more-horizontal ${PANE_HEADER_GLYPH_CLASS}`} />
				</ContextMenuButton>
			</header>
			{(treeMounted || sessionsMounted) && (
				<div
					className={
						state.expanded ? "min-h-0 flex-1 overflow-hidden" : "hidden"
					}
				>
					{treeMounted && (
						<div
							className={state.mode === "tree" ? "h-full min-h-0" : "hidden"}
							aria-hidden={state.mode !== "tree"}
						>
							<ProjectExplorerTree
								project={project}
								gitStatus={gitStatus}
								refreshToken={treeRefreshToken}
								searchToken={treeSearchToken}
							/>
						</div>
					)}
					{sessionsMounted && (
						<div
							className={
								state.mode === "sessions" ? "h-full min-h-0" : "hidden"
							}
							aria-hidden={state.mode !== "sessions"}
						>
							<ProjectSessionsPanel
								project={project}
								refreshToken={sessionsRefreshToken}
							/>
						</div>
					)}
				</div>
			)}
		</section>
	);
}

function projectMenuCommand(label: string) {
	if (label === "New File") return "resource.newFile";
	if (label === "New Folder") return "resource.newFolder";
	if (label === "Search Files…") return "project.search";
	if (label === "Refresh Explorer") return "resource.refresh";
	if (label === "New Chat…") return "project.newChat";
	if (label === "Refresh Sessions") return "project.refreshSessions";
	if (label === "Open Git") return "project.openGit";
	if (label === "Open in Terminal") return "project.openTerminal";
	if (label === "Reveal in Finder") return "resource.reveal";
	if (label === "Close Project") return "project.close";
	return `project.${label.toLowerCase().replace(/ /g, "-")}`;
}

function useProjectMenu(
	project: ProjectInfo,
	mode: ProjectPaneMode,
	searchTree: () => void,
	refreshTree: () => void,
	refreshSessions: () => void,
): AppMenuItem[] {
	const { createTerminal, removeProject } = useShellular();
	const [capabilities, setCapabilities] =
		useState<WorkspaceCapabilities | null>(null);
	useEffect(() => {
		workspaceIntegration
			.capabilities()
			.then(setCapabilities)
			.catch(() => setCapabilities(null));
	}, []);
	return useMemo(() => {
		const viewItems = buildProjectViewMenuItems(mode, {
			newFile: () => void createProjectChild(project.path, "file", refreshTree),
			newFolder: () =>
				void createProjectChild(project.path, "directory", refreshTree),
			searchTree,
			refreshTree,
			newChat: () => requestNewChat(project.path),
			refreshSessions,
		});
		const commonItems: AppMenuItem[] = [
			...(project.gitInfo?.hasGit
				? [
						{
							icon: "icon-git-branch",
							label: "Open Git",
							onClick: () => focusDesktopGit(project.path),
						} satisfies AppMenuItem,
					]
				: []),
			{
				icon: "icon-terminal",
				label: "Open in Terminal",
				onClick: () =>
					void createTerminal({ cwd: project.path }).then((terminalId) => {
						if (terminalId)
							openWorkbenchSurface({
								kind: "terminal",
								id: `terminal:${terminalId}`,
								title: "Terminal",
								icon: "icon-terminal",
								terminalId,
								workspacePath: project.path,
							});
					}),
			},
			...(capabilities?.canReveal
				? [
						{
							icon: "icon-external-link",
							label: "Reveal in Finder",
							onClick: () => void workspaceIntegration.reveal(project.path),
						} satisfies AppMenuItem,
					]
				: []),
			{
				icon: "icon-x",
				label: "Close Project",
				divider: true,
				onClick: () =>
					void dialog
						.confirm(
							`Close "${project.name}"? Its files and open tabs will not be deleted.`,
							"Close Project",
						)
						.then(async (confirmed) => {
							if (confirmed) await removeProject(project.path);
						}),
			},
		];
		commonItems[0] = { ...commonItems[0], divider: true };
		return [...viewItems, ...commonItems];
	}, [
		capabilities,
		createTerminal,
		mode,
		searchTree,
		project,
		refreshSessions,
		refreshTree,
		removeProject,
	]);
}
