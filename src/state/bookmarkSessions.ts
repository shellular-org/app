import type { AiBackend } from "@shellular/protocol";
import file from "bridge/file";
import appConfig from "lib/appConfig";
import { useCallback, useSyncExternalStore } from "react";
import { getHostInfo } from "./connection";

// ─── Types ────────────────────────────────────────────────────

/**
 * The minimal snapshot we persist for a bookmarked session: enough to identify it
 * for the user (title, workspace, recency) and to load it (agentId + id).
 */
export interface BookmarkedSession {
	agentId: AiBackend;
	sessionId: string;
	title: string;
	workspacePath: string;
	updatedAt: number;
	bookmarkedAt: number;
}

// ─── In-memory store ──────────────────────────────────────────
// Keyed by `${agentId}:${sessionId}` so lookups by exact session are O(1),
// while iterating the values gives every bookmark across all agents.

const bookmarks = new Map<string, BookmarkedSession>();
const listeners = new Set<() => void>();
let loadedForHost = "";

// Cached snapshot for useSyncExternalStore — must keep a stable reference
// between emits, otherwise React loops forever re-rendering.
let snapshot: BookmarkedSession[] = [];

function bookmarkKey(agentId: AiBackend, sessionId: string): string {
	return `${agentId}:${sessionId}`;
}

function emit() {
	snapshot = Array.from(bookmarks.values()).sort(
		(a, b) => b.bookmarkedAt - a.bookmarkedAt,
	);
	for (const listener of Array.from(listeners)) listener();
}

export function subscribeBookmarkedSessions(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function isSessionBookmarked(
	agentId: AiBackend,
	sessionId: string,
): boolean {
	return bookmarks.has(bookmarkKey(agentId, sessionId));
}

/** All bookmarked sessions across every agent, newest bookmark first (stable ref). */
export function getAllBookmarkedSessions(): BookmarkedSession[] {
	return snapshot;
}

// ─── Persistence ──────────────────────────────────────────────

function bookmarkedSessionsPath(hostId: string): string {
	return `${appConfig.DATA_DIR}/bookmarked-sessions-${hostId}.json`;
}

/** Load bookmarks for a host into the in-memory store. Idempotent per host. */
export async function loadBookmarkedSessions(hostId: string): Promise<void> {
	if (loadedForHost === hostId) return;
	bookmarks.clear();
	try {
		const path = bookmarkedSessionsPath(hostId);
		if (await file.exists(path)) {
			const text = (await file.read(path, "text")) as string;
			const parsed = JSON.parse(text) as BookmarkedSession[];
			for (const bookmark of parsed) {
				bookmarks.set(
					bookmarkKey(bookmark.agentId, bookmark.sessionId),
					bookmark,
				);
			}
		}
	} catch {
		// Corrupt/missing file — start empty.
	}
	loadedForHost = hostId;
	emit();
}

/** Clear the store on disconnect so it reloads for the next host. */
export function resetBookmarkedSessions() {
	bookmarks.clear();
	loadedForHost = "";
	emit();
}

async function persist(hostId: string): Promise<void> {
	await file.write(
		bookmarkedSessionsPath(hostId),
		JSON.stringify(getAllBookmarkedSessions()),
	);
}

export async function bookmarkSession(
	hostId: string,
	bookmark: Omit<BookmarkedSession, "bookmarkedAt">,
): Promise<void> {
	bookmarks.set(bookmarkKey(bookmark.agentId, bookmark.sessionId), {
		...bookmark,
		bookmarkedAt: Date.now(),
	});
	emit();
	await persist(hostId);
}

export async function removeSessionBookmark(
	hostId: string,
	agentId: AiBackend,
	sessionId: string,
): Promise<void> {
	bookmarks.delete(bookmarkKey(agentId, sessionId));
	emit();
	await persist(hostId);
}

// ─── React binding ────────────────────────────────────────────

export interface UseBookmarkedSessions {
	/** All bookmarks across agents, or scoped to `agentId` when one is passed. */
	bookmarked: BookmarkedSession[];
	isBookmarked: (agentId: AiBackend, sessionId: string) => boolean;
	toggleBookmark: (bookmark: Omit<BookmarkedSession, "bookmarkedAt">) => void;
}

/**
 * Subscribe to bookmarked sessions. Pass an `agentId` to scope the returned list
 * to that agent (per-agent sessions page); omit it for the global list
 * (Agents tab bookmarked page). Mutations resolve the active host internally.
 */
export function useBookmarkedSessions(
	agentId?: AiBackend,
): UseBookmarkedSessions {
	const all = useSyncExternalStore(
		subscribeBookmarkedSessions,
		getAllBookmarkedSessions,
	);

	const bookmarked = agentId
		? all.filter((bookmark) => bookmark.agentId === agentId)
		: all;

	const isBookmarked = useCallback(
		(id: AiBackend, sessionId: string) => isSessionBookmarked(id, sessionId),
		[],
	);

	const toggleBookmark = useCallback(
		(bookmark: Omit<BookmarkedSession, "bookmarkedAt">) => {
			const hostId = getHostInfo()?.id;
			if (!hostId) return;
			if (isSessionBookmarked(bookmark.agentId, bookmark.sessionId)) {
				removeSessionBookmark(
					hostId,
					bookmark.agentId,
					bookmark.sessionId,
				).catch(console.error);
			} else {
				bookmarkSession(hostId, bookmark).catch(console.error);
			}
		},
		[],
	);

	return {
		bookmarked: bookmarked,
		isBookmarked: isBookmarked,
		toggleBookmark: toggleBookmark,
	};
}
