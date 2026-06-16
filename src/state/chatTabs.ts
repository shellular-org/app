import type { AiBackend } from "@shellular/protocol";
import file from "bridge/file";
import appConfig from "lib/appConfig";
import { useCallback, useSyncExternalStore } from "react";
import { getHostInfo } from "./connection";

// ─── Types ────────────────────────────────────────────────────

/**
 * A chat kept open in a project's consolidated workspace. One project can hold
 * tabs from multiple agents (Claude, Codex, …), so each tab carries its own
 * `agentId`. `sessionId` is "" for a freshly-opened tab that hasn't created its
 * ACP session yet (no first message sent); it's filled in via {@link updateChatTab}
 * once the conversation page reports the real id back.
 */
export interface ChatTab {
	/** Stable local id for the tab, independent of the ACP session id. */
	id: string;
	agentId: AiBackend;
	/** ACP session id, or "" until the first message creates the session. */
	sessionId: string;
	title: string;
	createdAt: number;
	updatedAt: number;
}

// ─── In-memory store ──────────────────────────────────────────
// Keyed by project path; each value is the ordered list of open tabs for that
// project. We keep a per-project cached snapshot array (stable reference between
// emits) so useSyncExternalStore doesn't loop.

const tabsByProject = new Map<string, ChatTab[]>();
const listeners = new Set<() => void>();
let loadedForHost = "";

const EMPTY: ChatTab[] = [];

function emit() {
	for (const listener of Array.from(listeners)) listener();
}

export function subscribeChatTabs(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Open tabs for a project, in display order (stable reference between emits). */
export function getChatTabs(projectPath: string): ChatTab[] {
	return tabsByProject.get(projectPath) ?? EMPTY;
}

// ─── Persistence ──────────────────────────────────────────────
// Local to the device, keyed by host id — same convention as projects and
// bookmarked sessions. The on-disk shape is { [projectPath]: ChatTab[] }.

function chatTabsPath(hostId: string): string {
	return `${appConfig.DATA_DIR}/chat-tabs-${hostId}.json`;
}

/** Load chat tabs for a host into the in-memory store. Idempotent per host. */
export async function loadChatTabs(hostId: string): Promise<void> {
	if (loadedForHost === hostId) return;
	tabsByProject.clear();
	try {
		const path = chatTabsPath(hostId);
		if (await file.exists(path)) {
			const text = (await file.read(path, "text")) as string;
			const parsed = JSON.parse(text) as Record<string, ChatTab[]>;
			for (const [projectPath, tabs] of Object.entries(parsed)) {
				if (Array.isArray(tabs) && tabs.length) {
					tabsByProject.set(projectPath, tabs);
				}
			}
		}
	} catch {
		// Corrupt/missing file — start empty.
	}
	loadedForHost = hostId;
	emit();
}

/** Clear the store on disconnect so it reloads for the next host. */
export function resetChatTabs() {
	tabsByProject.clear();
	loadedForHost = "";
	emit();
}

async function persist(hostId: string): Promise<void> {
	const out: Record<string, ChatTab[]> = {};
	for (const [projectPath, tabs] of tabsByProject) {
		if (tabs.length) out[projectPath] = tabs;
	}
	await file.write(chatTabsPath(hostId), JSON.stringify(out));
}

function activeHostId(): string | undefined {
	return getHostInfo()?.id;
}

function setTabs(projectPath: string, tabs: ChatTab[]) {
	if (tabs.length) tabsByProject.set(projectPath, tabs);
	else tabsByProject.delete(projectPath);
	emit();
	const hostId = activeHostId();
	if (hostId) persist(hostId).catch(console.error);
}

/**
 * Record (upsert) a chat in a project's cache, keyed by its stable local `id`.
 * Each chat calls this on mount and whenever its sessionId/title changes, so the
 * sidebar can list every chat opened in the folder without hitting the CLI.
 * Existing fields are only overwritten by meaningful values (never blanked, and
 * never downgraded back to the "New Chat" placeholder).
 */
export function recordChatTab(
	projectPath: string,
	input: {
		id: string;
		agentId: AiBackend;
		sessionId?: string;
		title?: string;
	},
): void {
	const tabs = getChatTabs(projectPath);
	const index = tabs.findIndex((tab) => tab.id === input.id);
	const now = Date.now();

	if (index < 0) {
		const tab: ChatTab = {
			id: input.id,
			agentId: input.agentId,
			sessionId: input.sessionId ?? "",
			title: input.title ?? "New Chat",
			createdAt: now,
			updatedAt: now,
		};
		setTabs(projectPath, [...tabs, tab]);
		return;
	}

	const current = tabs[index];
	const nextSessionId = input.sessionId || current.sessionId;
	const nextTitle =
		input.title && input.title !== "New Chat" ? input.title : current.title;
	if (nextSessionId === current.sessionId && nextTitle === current.title) {
		return;
	}
	const updated = [...tabs];
	updated[index] = {
		...current,
		sessionId: nextSessionId,
		title: nextTitle,
		updatedAt: now,
	};
	setTabs(projectPath, updated);
}

/** Close a tab (does not touch the underlying ACP session). */
export function removeChatTab(projectPath: string, tabId: string): void {
	const tabs = getChatTabs(projectPath);
	const updated = tabs.filter((tab) => tab.id !== tabId);
	if (updated.length === tabs.length) return;
	setTabs(projectPath, updated);
}

// ─── React binding ────────────────────────────────────────────

/** Subscribe to the open chat tabs for a single project. */
export function useChatTabs(projectPath: string): ChatTab[] {
	const getSnapshot = useCallback(
		() => getChatTabs(projectPath),
		[projectPath],
	);
	return useSyncExternalStore(subscribeChatTabs, getSnapshot);
}
