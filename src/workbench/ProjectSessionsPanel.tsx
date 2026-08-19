import clsx from "clsx";
import AgentIcon from "components/AgentIcon";
import Loader from "components/Loader";
import { getAgentIcon } from "lib/agents";
import { chatTabId } from "lib/chatTabId";
import { formatRelativeTime } from "lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectInfo } from "state";
import { useShellular } from "state";
import { type AcpAgentInfo, acpListSessions } from "state/acp";
import { useChatTabs } from "state/chatTabs";
import {
	mergeProjectSessions,
	type ProjectSession,
	toProjectSession,
} from "./projectSessions";
import { openWorkbenchSurface } from "./store";
import { utilityMetadata } from "./surfaces";

const fallbackAgentTitles: Record<string, string> = {
	codex: "Codex",
	opencode: "OpenCode",
	"claude-code": "Claude Code",
	copilot: "GitHub Copilot",
	cursor: "Cursor",
	pi: "Pi",
	hermes: "Hermes",
	"grok-build": "Grok Build",
};

function fallbackAgentTitle(agentId: string) {
	return fallbackAgentTitles[agentId] ?? agentId;
}

function agentTitle(agent: Pick<AcpAgentInfo, "id" | "name" | "title">) {
	return (
		agent.title?.trim() || agent.name?.trim() || fallbackAgentTitle(agent.id)
	);
}

function formatAgentNames(names: string[]) {
	if (names.length <= 1) return names[0] ?? "";
	if (names.length === 2) return names.join(" and ");
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export default function ProjectSessionsPanel({
	project,
	refreshToken,
}: {
	project: ProjectInfo;
	refreshToken: number;
}) {
	const { agents } = useShellular();
	const availableAgents = useMemo(
		() => Object.values(agents).filter((agent) => agent.available),
		[agents],
	);
	const drafts = useChatTabs(project.path);
	const [sessions, setSessions] = useState<ProjectSession[]>([]);
	const [cursors, setCursors] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [failedAgents, setFailedAgents] = useState<AcpAgentInfo[]>([]);
	const [successfulAgentCount, setSuccessfulAgentCount] = useState(0);
	const [retrying, setRetrying] = useState(false);
	const loadVersionRef = useRef(0);

	useEffect(() => {
		const loadVersion = ++loadVersionRef.current;
		let active = true;
		setLoading(refreshToken >= 0);
		setRetrying(false);
		Promise.allSettled(
			availableAgents.map(async (agent) => ({
				agent,
				result: await acpListSessions(agent.id, project.path, agent),
			})),
		).then((results) => {
			if (!active || loadVersionRef.current !== loadVersion) return;
			const loaded = collectSessionResults(
				results,
				availableAgents,
				project.path,
			);
			setFailedAgents(loaded.failedAgents);
			setSuccessfulAgentCount(loaded.succeededAgentIds.length);
			setCursors(loaded.cursors);
			setSessions(
				mergeProjectSessions([], loaded.sessions, drafts, project.path),
			);
			setLoading(false);
		});
		return () => {
			active = false;
			if (loadVersionRef.current === loadVersion) loadVersionRef.current++;
		};
	}, [availableAgents, drafts, project.path, refreshToken]);

	const mergeSessions = useCallback(
		(next: ProjectSession[]) => {
			setSessions((current) =>
				mergeProjectSessions(current, next, drafts, project.path),
			);
		},
		[drafts, project.path],
	);

	const retryFailedAgents = useCallback(async () => {
		if (retrying || failedAgents.length === 0) return;
		const retryTargets = failedAgents;
		const loadVersion = loadVersionRef.current;
		setRetrying(true);
		const results = await Promise.allSettled(
			retryTargets.map(async (failedAgent) => {
				const currentAgent = agents[failedAgent.id] ?? failedAgent;
				return {
					agent: currentAgent,
					result: await acpListSessions(
						currentAgent.id,
						project.path,
						currentAgent,
					),
				};
			}),
		);
		if (loadVersionRef.current !== loadVersion) return;
		const loaded = collectSessionResults(results, retryTargets, project.path);
		setFailedAgents(loaded.failedAgents);
		setSuccessfulAgentCount(
			(current) => current + loaded.succeededAgentIds.length,
		);
		setCursors((current) => {
			const next = { ...current };
			for (const agentId of loaded.succeededAgentIds) delete next[agentId];
			return { ...next, ...loaded.cursors };
		});
		mergeSessions(loaded.sessions);
		setRetrying(false);
	}, [agents, failedAgents, mergeSessions, project.path, retrying]);

	const loadMore = async () => {
		setLoadingMore(true);
		try {
			const results = await Promise.allSettled(
				Object.entries(cursors).map(async ([agentId, cursor]) => ({
					agentId,
					result: await acpListSessions(
						agentId,
						project.path,
						agents[agentId],
						cursor,
					),
				})),
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
		} finally {
			setLoadingMore(false);
		}
	};

	if (loading) {
		return (
			<div className="grid h-full place-items-center">
				<Loader size={18} />
			</div>
		);
	}

	return (
		<div className="desktop-scroll-area desktop-scroll-area-stable h-full overflow-x-hidden overflow-y-auto p-1.5">
			{sessions.length === 0 && failedAgents.length === 0 && (
				<p className="m-0 px-2 py-3 text-xs text-secondary-text">
					No sessions yet
				</p>
			)}
			{sessions.map((session) => {
				const agent = agents[session.agentId];
				const title = agent
					? agentTitle(agent)
					: fallbackAgentTitle(session.agentId);
				const sessionTitle = session.title || "Untitled Chat";
				const isAvailable = agent?.available === true;
				return (
					<button
						key={session.key}
						type="button"
						className={clsx(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-soft",
							isAvailable
								? "text-primary-text"
								: "text-secondary-text opacity-70",
						)}
						aria-label={
							isAvailable
								? `Open ${sessionTitle} with ${title}`
								: `Open Manage Agents to use ${title} session ${sessionTitle}`
						}
						onClick={() => {
							if (!agent?.available) {
								openWorkbenchSurface({
									kind: "utility",
									id: "utility:manage-agents",
									page: "manage-agents",
									...utilityMetadata["manage-agents"],
								});
								return;
							}
							openWorkbenchSurface({
								kind: "chat",
								id: chatTabId(agent.id, session.sessionId ?? ""),
								title: sessionTitle,
								icon: getAgentIcon(agent.id),
								agentId: agent.id,
								sessionId: session.sessionId ?? "",
								workspacePath: session.workspacePath || project.path,
								createOnFirstMessage: !session.sessionId,
							});
						}}
					>
						{agent ? (
							<AgentIcon agent={agent} className="" />
						) : (
							<span className={getAgentIcon(session.agentId)} />
						)}
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-xs">{sessionTitle}</span>
							<small className="truncate text-[10px] text-secondary-text">
								{title} ·{" "}
								{isAvailable
									? session.draft
										? "draft"
										: formatRelativeTime(session.updatedAt)
									: "Unavailable — manage agents"}
							</small>
						</span>
					</button>
				);
			})}
			{Object.keys(cursors).length > 0 && (
				<button
					type="button"
					className="mt-1 w-full rounded-md px-2 py-1.5 text-xs text-accent hover:bg-surface-soft disabled:opacity-50"
					disabled={loadingMore}
					onClick={() => void loadMore()}
				>
					{loadingMore ? "Loading…" : "Load more"}
				</button>
			)}
			{failedAgents.length > 0 && (
				<div
					role="status"
					className="mx-1 mt-1 flex flex-col gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-2 text-xs text-secondary-text"
				>
					<div className="flex items-start gap-1.5 leading-4">
						<span
							className="icon-alert-triangle mt-px shrink-0 text-warning"
							aria-hidden="true"
						/>
						<span>
							Couldn’t load sessions from{" "}
							{formatAgentNames(failedAgents.map(agentTitle))}.
							{successfulAgentCount > 0 && (
								<> Sessions from other agents are still shown.</>
							)}
						</span>
					</div>
					<button
						type="button"
						className="self-start rounded px-1.5 py-1 text-accent hover:bg-surface-soft disabled:opacity-50"
						disabled={retrying}
						onClick={() => void retryFailedAgents()}
					>
						{retrying ? "Retrying…" : "Retry"}
					</button>
				</div>
			)}
		</div>
	);
}

function collectSessionResults(
	results: PromiseSettledResult<{
		agent: AcpAgentInfo;
		result: Awaited<ReturnType<typeof acpListSessions>>;
	}>[],
	requestedAgents: AcpAgentInfo[],
	projectPath: string,
) {
	const sessions: ProjectSession[] = [];
	const cursors: Record<string, string> = {};
	const failedAgents: AcpAgentInfo[] = [];
	const succeededAgentIds: string[] = [];
	for (const [index, result] of results.entries()) {
		const requestedAgent = requestedAgents[index];
		if (!requestedAgent) continue;
		if (result.status === "rejected") {
			failedAgents.push(requestedAgent);
			continue;
		}
		const { agent, result: page } = result.value;
		succeededAgentIds.push(agent.id);
		if (page.nextCursor) cursors[agent.id] = page.nextCursor;
		sessions.push(
			...page.sessions.map((session) =>
				toProjectSession(agent.id, session, projectPath),
			),
		);
	}
	return { sessions, cursors, failedAgents, succeededAgentIds };
}
