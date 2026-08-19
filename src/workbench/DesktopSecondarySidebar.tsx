import EmptyState from "components/EmptyState";
import BookmarkSessionsPage from "pages/bookmark-sessions";
import GitHistoryPage from "pages/git-history";
import { CommitDetailContent } from "pages/git-history/CommitDetail";
import ChatSessionsPage from "pages/sessions";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useShellular } from "state";
import AgentsTab from "tabs/agents";
import type { DesktopGitWorkspace } from "./gitWorkspace";
import { AGENTS_NAVIGATION_ICON } from "./navigationIcons";
import ProjectExplorerTree from "./ProjectExplorerTree";
import { refreshProjectExplorer } from "./projectTreeWorkspace";
import SidebarResizeHandle from "./SidebarResizeHandle";
import {
	backDesktopSecondarySidebar,
	closeDesktopSecondarySidebar,
	DESKTOP_SECONDARY_SIDEBAR_ID,
	type DesktopSecondarySidebarRoute,
	getDesktopSecondarySidebarSnapshot,
	openDesktopSecondarySidebar,
	pushDesktopSecondarySidebar,
	secondarySidebarRouteKey,
	showProjectFilesSidebar,
	subscribeDesktopSecondarySidebar,
} from "./secondarySidebar";

export default function DesktopSecondarySidebar({
	width,
	overlay,
	gitStates,
	onRefreshGit,
	onResize,
	onResizeEnd,
}: {
	width: number;
	overlay: boolean;
	gitStates: DesktopGitWorkspace["states"];
	onRefreshGit: (projectPath: string) => Promise<void>;
	onResize: (width: number) => void;
	onResizeEnd: (width: number) => void;
}) {
	const snapshot = useSyncExternalStore(
		subscribeDesktopSecondarySidebar,
		getDesktopSecondarySidebarSnapshot,
	);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const previousOpenRef = useRef(false);
	const current = snapshot.stack[snapshot.stack.length - 1];

	useEffect(() => {
		if (snapshot.open && !previousOpenRef.current) {
			const active = document.activeElement;
			restoreFocusRef.current = active instanceof HTMLElement ? active : null;
		}
		if (!snapshot.open && previousOpenRef.current) {
			requestAnimationFrame(() => restoreFocusRef.current?.focus());
		}
		previousOpenRef.current = snapshot.open;
	}, [snapshot.open]);

	useEffect(() => {
		if (!snapshot.open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.key !== "Escape") return;
			event.preventDefault();
			closeDesktopSecondarySidebar();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [snapshot.open]);

	if (!snapshot.open || !current) return null;

	const sidebar = (
		<aside
			id={DESKTOP_SECONDARY_SIDEBAR_ID}
			className={`desktop-secondary-sidebar${overlay ? " is-overlay" : ""}`}
			style={{ width }}
			aria-label="Secondary sidebar"
		>
			<header className="desktop-secondary-sidebar-header">
				{snapshot.stack.length > 1 ? (
					<button
						type="button"
						className="desktop-secondary-sidebar-header-button"
						onClick={backDesktopSecondarySidebar}
						aria-label="Back"
						title="Back"
					>
						<span className="icon-chevron-left" aria-hidden="true" />
					</button>
				) : (
					<span
						className={`desktop-secondary-sidebar-route-icon ${routeIcon(current)}`}
						aria-hidden="true"
					/>
				)}
				<h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-primary-text">
					{routeTitle(current)}
				</h2>
				{current.view === "project-files" && (
					<>
						<SidebarHeaderButton
							icon="icon-search"
							label={`Search ${current.projectName} files`}
							onClick={() =>
								showProjectFilesSidebar(
									current.projectPath,
									current.projectName,
									{ search: true },
								)
							}
						/>
						<SidebarHeaderButton
							icon="icon-refresh-cw"
							label={`Refresh ${current.projectName} files`}
							onClick={() => {
								void refreshProjectExplorer(current.projectPath);
								void onRefreshGit(current.projectPath);
							}}
						/>
						<SidebarHeaderButton
							icon="icon-git-branch"
							label={`Open ${current.projectName} Git history`}
							onClick={() =>
								pushDesktopSecondarySidebar({
									view: "git-history",
									projectPath: current.projectPath,
									projectName: current.projectName,
								})
							}
						/>
					</>
				)}
				<button
					type="button"
					className="desktop-secondary-sidebar-header-button"
					onClick={closeDesktopSecondarySidebar}
					aria-label="Close secondary sidebar"
					title="Close secondary sidebar"
				>
					<span className="icon-x" aria-hidden="true" />
				</button>
			</header>
			<div className="relative min-h-0 flex-1 overflow-hidden">
				{snapshot.stack.map((route, index) => {
					const active = index === snapshot.stack.length - 1;
					return (
						<div
							key={secondarySidebarRouteKey(route)}
							className="desktop-secondary-sidebar-view absolute inset-0 min-h-0 overflow-hidden"
							hidden={!active}
							inert={!active}
							aria-hidden={!active}
						>
							<SecondarySidebarRouteView
								route={route}
								gitStates={gitStates}
								onOpenMainContent={() => {
									if (overlay) closeDesktopSecondarySidebar();
								}}
							/>
						</div>
					);
				})}
			</div>
		</aside>
	);

	if (overlay) {
		return (
			<>
				<button
					type="button"
					className="desktop-secondary-sidebar-backdrop"
					onClick={closeDesktopSecondarySidebar}
					aria-label="Close secondary sidebar"
				/>
				{sidebar}
			</>
		);
	}

	return (
		<>
			<SidebarResizeHandle
				className="desktop-secondary-sidebar-resizer"
				ariaLabel="Resize secondary sidebar"
				edge="left"
				value={width}
				min={240}
				max={480}
				onResize={onResize}
				onResizeEnd={onResizeEnd}
			/>
			{sidebar}
		</>
	);
}

function SecondarySidebarRouteView({
	route,
	gitStates,
	onOpenMainContent,
}: {
	route: DesktopSecondarySidebarRoute;
	gitStates: DesktopGitWorkspace["states"];
	onOpenMainContent: () => void;
}) {
	const { agents, projects } = useShellular();

	switch (route.view) {
		case "agents":
			return (
				<AgentsTab
					compact
					onOpenBookmarked={() =>
						pushDesktopSecondarySidebar({ view: "bookmarked-chats" })
					}
					onSelectAgent={(agent) =>
						pushDesktopSecondarySidebar({
							view: "sessions",
							agentId: agent.id,
						})
					}
				/>
			);
		case "bookmarked-chats":
			return <BookmarkSessionsPage embedded onNavigate={onOpenMainContent} />;
		case "project-files": {
			const project = projects.find(
				(candidate) => candidate.path === route.projectPath,
			) ?? {
				path: route.projectPath,
				name: route.projectName,
				addedAt: 0,
			};
			return (
				<ProjectExplorerTree
					project={project}
					refreshToken={0}
					searchToken={route.searchRequest ?? 0}
					gitStatus={gitStates[route.projectPath]?.status}
					onNavigate={onOpenMainContent}
				/>
			);
		}
		case "sessions": {
			const agent = agents[route.agentId];
			if (!agent) {
				return (
					<EmptyState
						mascot="error"
						message="Agent is unavailable"
						action={
							<button type="button" onClick={backDesktopSecondarySidebar}>
								Back to Agents
							</button>
						}
					/>
				);
			}
			return (
				<ChatSessionsPage
					backend={route.agentId}
					agent={agent}
					workspace={route.workspacePath}
					activeChatId={route.activeChatId}
					embedded
					onNavigate={onOpenMainContent}
					onWorkspaceChange={(workspacePath) =>
						openDesktopSecondarySidebar([
							{ view: "agents" },
							{
								...route,
								workspacePath,
								activeChatId: undefined,
							},
						])
					}
				/>
			);
		}
		case "git-history":
			return (
				<GitHistoryPage
					projectPath={route.projectPath}
					projectName={route.projectName}
					embedded
					onSelectCommit={(commit) =>
						pushDesktopSecondarySidebar({
							view: "git-commit",
							projectPath: route.projectPath,
							projectName: route.projectName,
							commit,
						})
					}
				/>
			);
		case "git-commit":
			return (
				<div className="desktop-scroll-area size-full overflow-auto">
					<CommitDetailContent
						projectPath={route.projectPath}
						commit={route.commit}
						onNavigate={onOpenMainContent}
					/>
				</div>
			);
	}
}

function SidebarHeaderButton({
	icon,
	label,
	onClick,
}: {
	icon: string;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="desktop-secondary-sidebar-header-button"
			onClick={onClick}
			aria-label={label}
			title={label}
		>
			<span className={icon} aria-hidden="true" />
		</button>
	);
}

function routeTitle(route: DesktopSecondarySidebarRoute) {
	switch (route.view) {
		case "agents":
			return "Agents";
		case "bookmarked-chats":
			return "Bookmarked Chats";
		case "sessions":
			return route.workspacePath
				? `Sessions · ${basename(route.workspacePath)}`
				: "Sessions";
		case "project-files":
			return `${route.projectName} · Files`;
		case "git-history":
			return `${route.projectName} · History`;
		case "git-commit":
			return `Commit ${route.commit.shortHash}`;
	}
}

function routeIcon(route: DesktopSecondarySidebarRoute) {
	switch (route.view) {
		case "agents":
			return AGENTS_NAVIGATION_ICON;
		case "bookmarked-chats":
			return "icon-bookmark";
		case "sessions":
			return "icon-message-square";
		case "project-files":
			return "icon-folder";
		case "git-history":
			return "icon-git-branch";
		case "git-commit":
			return "icon-git-commit";
	}
}

function basename(path: string) {
	return path.split("/").filter(Boolean).pop() || path;
}
