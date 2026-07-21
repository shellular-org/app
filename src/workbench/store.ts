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
const commandListeners = new Set<() => void>();
let commandRevision = 0;

export type WorkbenchSurfaceCommand =
	| "save"
	| "undo"
	| "redo"
	| "cut"
	| "copy"
	| "paste"
	| "select-all";

export interface WorkbenchCommandHandler {
	run: () => void | Promise<void>;
	enabled?: () => boolean;
}

const commandHandlers = new Map<
	string,
	Partial<Record<WorkbenchSurfaceCommand, WorkbenchCommandHandler>>
>();

function emitCommandState() {
	commandRevision += 1;
	for (const listener of commandListeners) listener();
}

function key(hostId: string) {
	return `shellular:desktop-workbench:${hostId}`;
}

function emit(next: WorkbenchSnapshot, persist = true) {
	snapshot = next;
	for (const listener of listeners) listener();
	if (persist && next.hostId) {
		const tabs = next.tabs
			.filter((tab) => tab.restorable !== false)
			.map(({ dirty: _dirty, ...tab }) => tab);
		const activeId = tabs.some((tab) => tab.id === next.activeId)
			? next.activeId
			: (tabs[0]?.id ?? null);
		store
			.set(key(next.hostId), {
				tabs,
				activeId,
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

export function registerWorkbenchSaveHandler(
	id: string,
	handler: () => void | Promise<void>,
	enabled?: () => boolean,
) {
	return registerWorkbenchCommandHandlers(id, {
		save: { run: handler, enabled },
	});
}

export async function saveWorkbenchSurface(id: string | null) {
	return executeWorkbenchSurfaceCommand(id, "save");
}

export function registerWorkbenchCommandHandlers(
	id: string,
	handlers: Partial<Record<WorkbenchSurfaceCommand, WorkbenchCommandHandler>>,
) {
	const previous = commandHandlers.get(id) ?? {};
	const next = { ...previous, ...handlers };
	commandHandlers.set(id, next);
	emitCommandState();
	return () => {
		const current = commandHandlers.get(id);
		if (!current) return;
		const remaining = { ...current };
		for (const command of Object.keys(handlers) as WorkbenchSurfaceCommand[]) {
			if (remaining[command] === handlers[command]) delete remaining[command];
		}
		if (Object.keys(remaining).length > 0) commandHandlers.set(id, remaining);
		else commandHandlers.delete(id);
		emitCommandState();
	};
}

export function notifyWorkbenchCommandStateChanged() {
	emitCommandState();
}

export function subscribeWorkbenchCommands(listener: () => void) {
	commandListeners.add(listener);
	return () => commandListeners.delete(listener);
}

export function getWorkbenchCommandRevision() {
	return commandRevision;
}

export function canExecuteWorkbenchSurfaceCommand(
	id: string | null,
	command: WorkbenchSurfaceCommand,
) {
	if (!id) return false;
	const handler = commandHandlers.get(id)?.[command];
	if (!handler) return false;
	try {
		return handler.enabled?.() ?? true;
	} catch {
		return false;
	}
}

export async function executeWorkbenchSurfaceCommand(
	id: string | null,
	command: WorkbenchSurfaceCommand,
) {
	if (!id || !canExecuteWorkbenchSurfaceCommand(id, command)) return false;
	const handler = commandHandlers.get(id)?.[command];
	if (!handler) return false;
	await handler.run();
	return true;
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
	if (commandHandlers.delete(id)) emitCommandState();
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
	const tabs = (saved?.tabs ?? []).filter((tab) => {
		if (process.env.IS_MACOS && tab.kind === "browser") {
			return false;
		}
		return (
			tab.kind !== "terminal" ||
			!liveTerminalIds ||
			liveTerminalIds.has(tab.terminalId)
		);
	});
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
	commandHandlers.clear();
	emitCommandState();
	emit(EMPTY, false);
}
