import type { AiBackend } from "@shellular/protocol";

/**
 * Stable id for a chat used both as its page-stack id and its key in the
 * per-folder chat cache (`chatTabs`).
 *
 * An existing session is keyed by `agent:session` so re-opening it reuses the
 * same page/cache entry. A brand-new chat (no session yet) gets a unique id so
 * multiple new chats — possibly for different agents in the same folder — never
 * collide.
 */
export function chatTabId(agentId: AiBackend, sessionId: string): string {
	return sessionId
		? `chat:${agentId}:${sessionId}`
		: `chat:new:${agentId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
}
