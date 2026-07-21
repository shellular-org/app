import AgentIcon from "components/AgentIcon";
import Loader from "components/Loader";
import { getAgentIcon } from "lib/agents";
import { chatTabId } from "lib/chatTabId";
import { formatRelativeTime } from "lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectInfo } from "state";
import { useShellular } from "state";
import { acpListSessions } from "state/acp";
import { useChatTabs } from "state/chatTabs";
import {
	mergeProjectSessions,
	type ProjectSession,
	toProjectSession,
} from "./projectSessions";
import { openWorkbenchSurface } from "./store";

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
	const [errors, setErrors] = useState(0);

	useEffect(() => {
		let active = true;
		setLoading(refreshToken >= 0);
		Promise.allSettled(
			availableAgents.map(async (agent) => ({
				agent,
				result: await acpListSessions(agent.id, project.path, agent),
			})),
		).then((results) => {
			if (!active) return;
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
			active = false;
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
			{sessions.length === 0 && (
				<p className="m-0 px-2 py-3 text-xs text-secondary-text">
					No sessions yet
				</p>
			)}
			{sessions.map((session) => {
				const agent = agents[session.agentId];
				return (
					<button
						key={session.key}
						type="button"
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-primary-text hover:bg-surface-soft"
						onClick={() => {
							if (!agent) return;
							openWorkbenchSurface({
								kind: "chat",
								id: chatTabId(agent.id, session.sessionId ?? ""),
								title: session.title || "Chat",
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
							<span className="truncate text-xs">{session.title}</span>
							<small className="truncate text-[10px] text-secondary-text">
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
					type="button"
					className="mt-1 w-full rounded-md px-2 py-1.5 text-xs text-accent hover:bg-surface-soft disabled:opacity-50"
					disabled={loadingMore}
					onClick={() => void loadMore()}
				>
					{loadingMore ? "Loading…" : "Load more"}
				</button>
			)}
			{errors > 0 && (
				<p className="m-0 px-2 py-2 text-xs text-danger">
					{errors} agent {errors === 1 ? "request" : "requests"} failed
				</p>
			)}
		</div>
	);
}
