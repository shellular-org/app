import dialog from "bridge/dialog";
import AgentIcon from "components/AgentIcon";
import AppMenu from "components/AppMenu";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import { getAgentIcon } from "lib/agents";
import { chatTabId } from "lib/chatTabId";
import { formatRelativeTime } from "lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type ProjectInfo, useShellular } from "state";
import { type AcpAgentInfo, acpListSessions } from "state/acp";
import { useChatTabs } from "state/chatTabs";
import useProjectPicker from "tabs/projects/useProjectPicker";
import {
	type WorkspaceCapabilities,
	workspaceIntegration,
} from "./integration";
import { tryOpenFileSurface } from "./openers";
import { buildProjectMenuItems } from "./projectCommands";
import {
	mergeProjectSessions,
	type ProjectSession,
	toProjectSession,
} from "./projectSessions";
import { openWorkbenchSurface } from "./store";

export default function ProjectSidebar() {
	const { connectionStatus, projects, loadingProjects } = useShellular();
	const { adding, openProjectPicker } = useProjectPicker();
	if (connectionStatus !== "connected") {
		return <EmptyState mascot="sleep" message="Connect to browse projects" />;
	}
	return (
		<div
			className={`workbench-project-list${!loadingProjects && projects.length === 0 ? " is-empty" : ""}`}
		>
			{!loadingProjects && projects.length > 0 && (
				<button
					type="button"
					className="workbench-open-folder"
					disabled={adding}
					onClick={openProjectPicker}
				>
					{adding ? (
						<Loader size={14} />
					) : (
						<span className="icon-folder-plus" />
					)}
					{adding ? "Adding project…" : "Open Folder"}
				</button>
			)}
			{loadingProjects ? (
				<EmptyState mascot="loading" message="Loading…" />
			) : projects.length ? (
				projects.map((project) => (
					<ProjectTree key={project.path} project={project} />
				))
			) : (
				<EmptyState
					mascot="greeting"
					message="No projects yet"
					description="Choose a folder or Git repository to add as a project."
					action={
						<button
							type="button"
							className="workbench-empty-folder"
							disabled={adding}
							onClick={openProjectPicker}
						>
							<span className="icon-folder-plus" />
							Open Folder
						</button>
					}
				/>
			)}
		</div>
	);
}

function ProjectTree({ project }: { project: ProjectInfo }) {
	const { agents, createTerminal, removeProject } = useShellular();
	const availableAgents = useMemo(
		() => Object.values(agents).filter((agent) => agent.available),
		[agents],
	);
	const drafts = useChatTabs(project.path);
	const [expanded, setExpanded] = useState(true);
	const [sessions, setSessions] = useState<ProjectSession[]>([]);
	const [cursors, setCursors] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [errors, setErrors] = useState(0);
	const [capabilities, setCapabilities] =
		useState<WorkspaceCapabilities | null>(null);

	useEffect(() => {
		workspaceIntegration
			.capabilities()
			.then(setCapabilities)
			.catch(() => {});
	}, []);

	const mergeSessions = useCallback(
		(next: ProjectSession[]) => {
			setSessions(mergeProjectSessions(sessions, next, drafts, project.path));
		},
		[drafts, project.path, sessions],
	);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		Promise.allSettled(
			availableAgents.map(async (agent) => {
				const result = await acpListSessions(agent.id, project.path, agent);
				return { agent, result };
			}),
		).then((results) => {
			if (cancelled) return;
			const next: ProjectSession[] = [];
			const nextCursors: Record<string, string> = {};
			let failed = 0;
			for (const result of results) {
				if (result.status === "rejected") {
					failed++;
					continue;
				}
				const { agent, result: page } = result.value;
				if (page.nextCursor) nextCursors[agent.id] = page.nextCursor;
				next.push(
					...page.sessions.map((session) =>
						toProjectSession(agent.id, session, project.path),
					),
				);
			}
			setErrors(failed);
			setCursors(nextCursors);
			setSessions(mergeProjectSessions([], next, drafts, project.path));
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [availableAgents, drafts, project.path]);

	const loadMore = async () => {
		setLoadingMore(true);
		const results = await Promise.allSettled(
			Object.entries(cursors).map(async ([agentId, cursor]) => {
				const agent = agents[agentId];
				const result = await acpListSessions(
					agentId,
					project.path,
					agent,
					cursor,
				);
				return { agentId, result };
			}),
		);
		const next: ProjectSession[] = [];
		const nextCursors: Record<string, string> = {};
		for (const result of results) {
			if (result.status !== "fulfilled") continue;
			if (result.value.result.nextCursor) {
				nextCursors[result.value.agentId] = result.value.result.nextCursor;
			}
			next.push(
				...result.value.result.sessions.map((session) =>
					toProjectSession(result.value.agentId, session, project.path),
				),
			);
		}
		setCursors(nextCursors);
		mergeSessions(next);
		setLoadingMore(false);
	};

	const openChat = (agent: AcpAgentInfo, session?: ProjectSession) => {
		const id = session?.sessionId
			? chatTabId(agent.id, session.sessionId)
			: chatTabId(agent.id, "");
		openWorkbenchSurface({
			kind: "chat",
			id,
			title: session?.title ?? "New Chat",
			icon: getAgentIcon(agent.id),
			agentId: agent.id,
			sessionId: session?.sessionId ?? "",
			workspacePath: session?.workspacePath || project.path,
			createOnFirstMessage: !session?.sessionId,
		});
	};

	const openExplore = async () => {
		tryOpenFileSurface({
			id: `files:${project.path}`,
			title: project.name,
			initialPath: project.path,
			mode: "project",
		});
	};

	const menuItems = buildProjectMenuItems(
		project,
		availableAgents,
		capabilities,
		{
			onNewChat: (agent) => openChat(agent),
			onExplore: openExplore,
			onGit: () =>
				openWorkbenchSurface({
					kind: "git",
					id: `git:${project.path}`,
					title: `${project.name} · Git`,
					icon: "icon-git-branch",
					projectPath: project.path,
					projectName: project.name,
				}),
			onShellularTerminal: async () => {
				const terminalId = await createTerminal({ cwd: project.path });
				if (terminalId) openTerminal(terminalId);
			},
			onRemove: async () => {
				if (
					await dialog.confirm(
						`Remove "${project.name}" from projects?`,
						"Remove Project",
					)
				) {
					await removeProject(project.path);
				}
			},
			onOpenInEditor: (editorId) =>
				workspaceIntegration.openInEditor(project.path, editorId),
			onReveal: () => workspaceIntegration.reveal(project.path),
			onOpenSystemTerminal: () =>
				workspaceIntegration.openSystemTerminal(project.path),
		},
	);

	return (
		<section className="workbench-project-tree">
			<div className="workbench-project-heading">
				<button type="button" onClick={() => setExpanded((value) => !value)}>
					<span
						className={expanded ? "icon-chevron-down" : "icon-chevron-right"}
					/>
					<span className="icon-folder" />
					<span>{project.name}</span>
				</button>
				<AppMenu ariaLabel={`Menu for ${project.name}`} items={menuItems}>
					<span className="icon-more-horizontal" />
				</AppMenu>
			</div>
			{expanded && (
				<div className="workbench-project-sessions">
					{loading && <Loader size={18} />}
					{!loading && sessions.length === 0 && (
						<p className="workbench-sidebar-note">No sessions yet</p>
					)}
					{sessions.map((session) => {
						const agent = agents[session.agentId];
						return (
							<button
								key={session.key}
								type="button"
								className="workbench-session-row"
								onClick={() => agent && openChat(agent, session)}
							>
								{agent ? (
									<AgentIcon agent={agent} className="" />
								) : (
									<span className={getAgentIcon(session.agentId)} />
								)}
								<span className="workbench-session-copy">
									<span>{session.title}</span>
									<small>
										{agent?.title ?? session.agentId} ·{" "}
										{session.draft
											? "draft"
											: formatRelativeTime(session.updatedAt)}
									</small>
								</span>
							</button>
						);
					})}
					{Object.keys(cursors).length > 0 && (
						<button
							className="workbench-load-more"
							type="button"
							disabled={loadingMore}
							onClick={loadMore}
						>
							{loadingMore ? "Loading…" : "Load more"}
						</button>
					)}
					{errors > 0 && (
						<p className="workbench-sidebar-error">
							{errors} agent {errors === 1 ? "request" : "requests"} failed
						</p>
					)}
				</div>
			)}
		</section>
	);
}

function openTerminal(terminalId: string) {
	openWorkbenchSurface({
		kind: "terminal",
		id: `terminal:${terminalId}`,
		title: "Terminal",
		icon: "icon-terminal",
		terminalId,
	});
}
