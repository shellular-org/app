import * as store from "lib/store";
import type { CloseGuard, WorkbenchSnapshot, WorkbenchSurface } from "./types";

const EMPTY: WorkbenchSnapshot = {
	tabs: [],
	activeId: null,
	hostId: "",
	dialog: null,
};
let snapshot = EMPTY;
const listeners = new Set<() => void>();
const closeGuards = new Map<string, CloseGuard>();

function key(hostId: string) {
	return `shellular:desktop-workbench:${hostId}`;
}

function emit(next: WorkbenchSnapshot, persist = true) {
	snapshot = next;
	for (const listener of listeners) listener();
	if (persist && next.hostId) {
		store
			.set(key(next.hostId), {
				tabs: next.tabs,
				activeId: next.activeId,
			})
			.catch(console.error);
	}
}

export function subscribeWorkbench(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getWorkbenchSnapshot() {
	return snapshot;
}

export function openWorkbenchSurface(surface: WorkbenchSurface) {
	const existing = snapshot.tabs.find((tab) => tab.id === surface.id);
	const tabs = existing
		? snapshot.tabs.map((tab) =>
				tab.id === surface.id ? { ...tab, ...surface } : tab,
			)
		: [...snapshot.tabs, surface];
	emit({ ...snapshot, tabs, activeId: surface.id });
}

export function openWorkbenchDialog(surface: WorkbenchSurface) {
	emit({ ...snapshot, dialog: surface }, false);
}

export function closeWorkbenchDialog(id?: string) {
	if (id && snapshot.dialog?.id !== id) return;
	emit({ ...snapshot, dialog: null }, false);
}

export function activateWorkbenchSurface(id: string) {
	if (snapshot.activeId === id || !snapshot.tabs.some((tab) => tab.id === id)) {
		return;
	}
	emit({ ...snapshot, activeId: id });
}

export function updateWorkbenchSurface(
	id: string,
	patch: Partial<WorkbenchSurface> & { sessionId?: string },
) {
	const index = snapshot.tabs.findIndex((tab) => tab.id === id);
	if (index < 0) return;
	const tabs = [...snapshot.tabs];
	tabs[index] = { ...tabs[index], ...patch } as WorkbenchSurface;
	emit({ ...snapshot, tabs });
}

export async function closeWorkbenchSurface(id: string) {
	const guard = closeGuards.get(id);
	if (guard && !(await guard())) return false;
	const index = snapshot.tabs.findIndex((tab) => tab.id === id);
	if (index < 0) return true;
	const tabs = snapshot.tabs.filter((tab) => tab.id !== id);
	let activeId = snapshot.activeId;
	if (activeId === id) {
		activeId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
	}
	closeGuards.delete(id);
	emit({ ...snapshot, tabs, activeId });
	return true;
}

export function registerWorkbenchCloseGuard(id: string, guard: CloseGuard) {
	closeGuards.set(id, guard);
	return () => {
		if (closeGuards.get(id) === guard) closeGuards.delete(id);
	};
}

export async function restoreWorkbench(
	hostId: string,
	liveTerminalIds?: Set<string>,
) {
	if (!hostId) {
		emit(EMPTY, false);
		return;
	}
	if (snapshot.hostId === hostId) return;
	const saved = await store.get<{
		tabs?: WorkbenchSurface[];
		activeId?: string | null;
	}>(key(hostId));
	const tabs = (saved?.tabs ?? []).filter(
		(tab) =>
			tab.kind !== "terminal" ||
			!liveTerminalIds ||
			liveTerminalIds.has(tab.terminalId),
	);
	const activeId = tabs.some((tab) => tab.id === saved?.activeId)
		? (saved?.activeId ?? null)
		: (tabs[0]?.id ?? null);
	emit({ tabs, activeId, hostId, dialog: null }, false);
}

export function pruneWorkbenchTerminals(liveTerminalIds: Set<string>) {
	const tabs = snapshot.tabs.filter(
		(tab) => tab.kind !== "terminal" || liveTerminalIds.has(tab.terminalId),
	);
	if (tabs.length === snapshot.tabs.length) return;
	const activeId = tabs.some((tab) => tab.id === snapshot.activeId)
		? snapshot.activeId
		: (tabs[0]?.id ?? null);
	emit({ ...snapshot, tabs, activeId });
}

export function resetWorkbench() {
	closeGuards.clear();
	emit(EMPTY, false);
}
