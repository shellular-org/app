import type { AiBackend, AiSession } from "@shellular/protocol";
import type { ChatTab } from "state/chatTabs";

export interface ProjectSession {
	key: string;
	agentId: AiBackend;
	sessionId: string;
	title: string;
	workspacePath: string;
	updatedAt: number;
	draft: boolean;
}

export function toProjectSession(
	agentId: AiBackend,
	session: AiSession,
	fallbackPath: string,
): ProjectSession {
	return {
		key: `${agentId}:${session.id}`,
		agentId,
		sessionId: session.id ?? "",
		title: session.title ?? "Untitled Chat",
		workspacePath: session.workspacePath ?? fallbackPath,
		updatedAt: session.updatedAt ?? session.createdAt ?? 0,
		draft: false,
	};
}

export function mergeProjectSessions(
	existing: ProjectSession[],
	incoming: ProjectSession[],
	drafts: ChatTab[],
	projectPath: string,
): ProjectSession[] {
	const merged = new Map<string, ProjectSession>();
	for (const tab of drafts) {
		const key = `${tab.agentId}:${tab.sessionId || tab.id}`;
		merged.set(key, {
			key,
			agentId: tab.agentId,
			sessionId: tab.sessionId,
			title: tab.title,
			workspacePath: projectPath,
			updatedAt: tab.updatedAt,
			draft: !tab.sessionId,
		});
	}
	for (const item of [...existing, ...incoming]) {
		const current = merged.get(item.key);
		if (!current || item.updatedAt >= current.updatedAt)
			merged.set(item.key, item);
	}
	return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
