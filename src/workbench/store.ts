import * as store from "lib/store";
import {
	activateWorkbenchGroupTab,
	collectWorkbenchSurfaceIds,
	createWorkbenchGroup,
	findWorkbenchGroup,
	findWorkbenchNode,
	findWorkbenchTab,
	moveWorkbenchTab,
	normalizeWorkbenchTree,
	removeWorkbenchTabs,
	resizeWorkbenchSplit,
	type SplitDirection,
	setWorkbenchTabPinned,
	splitWorkbenchGroupWithTab,
	updateWorkbenchGroup,
	workbenchGroups,
} from "./layoutTree";
import type {
	CloseGuard,
	WorkbenchCloseContext,
	WorkbenchLayoutNode,
	WorkbenchSnapshot,
	WorkbenchSurface,
} from "./types";

const ROOT_GROUP_ID = "group:root";
const PERSISTENCE_VERSION = 2;

interface PersistedWorkbenchV2 {
	version: 2;
	surfaces: WorkbenchSurface[];
	root: WorkbenchLayoutNode;
	focusedGroupId: string;
}

interface LegacyPersistedWorkbench {
	tabs?: WorkbenchSurface[];
	activeId?: string | null;
}

function emptySnapshot(hostId = ""): WorkbenchSnapshot {
	return {
		surfaces: [],
		root: createWorkbenchGroup(ROOT_GROUP_ID),
		focusedGroupId: ROOT_GROUP_ID,
		activeId: null,
		hostId,
		dialog: null,
	};
}

let snapshot = emptySnapshot();
const listeners = new Set<() => void>();
const closeGuards = new Map<string, CloseGuard>();
const commandListeners = new Set<() => void>();
let commandRevision = 0;
let persistenceTail: Promise<void> = Promise.resolve();

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

function resolveFocus(root: WorkbenchLayoutNode, requestedId?: string | null) {
	return (
		(requestedId && findWorkbenchGroup(root, requestedId)?.id) ||
		workbenchGroups(root)[0]?.id ||
		ROOT_GROUP_ID
	);
}

function nearestSurvivingGroup(
	previousRoot: WorkbenchLayoutNode,
	previousGroupId: string,
	nextRoot: WorkbenchLayoutNode,
) {
	const siblingPath = (
		node: WorkbenchLayoutNode,
	): WorkbenchLayoutNode[] | null => {
		if (node.type === "group") return node.id === previousGroupId ? [] : null;
		const first = siblingPath(node.first);
		if (first) return [...first, node.second];
		const second = siblingPath(node.second);
		if (second) return [...second, node.first];
		return null;
	};
	for (const sibling of siblingPath(previousRoot) ?? []) {
		for (const candidate of workbenchGroups(sibling)) {
			if (findWorkbenchGroup(nextRoot, candidate.id)) return candidate.id;
		}
	}
	return resolveFocus(nextRoot);
}

function finalize(next: WorkbenchSnapshot): WorkbenchSnapshot {
	const focusedGroupId = resolveFocus(next.root, next.focusedGroupId);
	const group = findWorkbenchGroup(next.root, focusedGroupId);
	return {
		...next,
		focusedGroupId,
		activeId: group?.activeId ?? null,
	};
}

function stripRuntimeState(surface: WorkbenchSurface): WorkbenchSurface {
	const { dirty: _dirty, ...persisted } = surface;
	return persisted as WorkbenchSurface;
}

function canRestoreSurface(
	surface: WorkbenchSurface,
	liveTerminalIds?: Set<string>,
) {
	if (
		!surface ||
		typeof surface.id !== "string" ||
		surface.restorable === false
	) {
		return false;
	}
	if (surface.kind === "agent-sessions" || surface.kind === "git") {
		return false;
	}
	if (
		surface.kind === "utility" &&
		(surface.page === "agents" || surface.page === "bookmarked-sessions")
	) {
		return false;
	}
	if (process.env.IS_MACOS && surface.kind === "browser") return false;
	return (
		surface.kind !== "terminal" ||
		!liveTerminalIds ||
		liveTerminalIds.has(surface.terminalId)
	);
}

function isLayoutNode(value: unknown): value is WorkbenchLayoutNode {
	if (!value || typeof value !== "object") return false;
	const node = value as Partial<WorkbenchLayoutNode>;
	if (typeof node.id !== "string") return false;
	if (node.type === "group") {
		return (
			Array.isArray(node.tabs) &&
			node.tabs.every(
				(tab) =>
					Boolean(tab) &&
					typeof tab.surfaceId === "string" &&
					typeof tab.pinned === "boolean",
			)
		);
	}
	return (
		node.type === "split" &&
		isLayoutNode(node.first) &&
		isLayoutNode(node.second)
	);
}

function repairLayout(
	root: WorkbenchLayoutNode,
	surfaces: WorkbenchSurface[],
): WorkbenchLayoutNode {
	const validIds = new Set(surfaces.map((surface) => surface.id));
	let repaired = normalizeWorkbenchTree(root, validIds);
	const referenced = new Set(collectWorkbenchSurfaceIds(repaired));
	const missing = surfaces.filter((surface) => !referenced.has(surface.id));
	if (missing.length === 0) return repaired;
	const target =
		workbenchGroups(repaired)[0] ?? createWorkbenchGroup(ROOT_GROUP_ID);
	repaired = updateWorkbenchGroup(repaired, target.id, (group) => ({
		...group,
		tabs: [
			...group.tabs,
			...missing.map((surface) => ({ surfaceId: surface.id, pinned: false })),
		],
		activeId: group.activeId ?? missing[0]?.id ?? null,
	}));
	return repaired;
}

function serialize(next: WorkbenchSnapshot): PersistedWorkbenchV2 {
	const surfaces = next.surfaces
		.filter((surface) => canRestoreSurface(surface))
		.map(stripRuntimeState);
	const root = repairLayout(next.root, surfaces);
	return {
		version: PERSISTENCE_VERSION,
		surfaces,
		root,
		focusedGroupId: resolveFocus(root, next.focusedGroupId),
	};
}

function queuePersistence(next: WorkbenchSnapshot) {
	if (!next.hostId) return;
	const hostId = next.hostId;
	const value = serialize(next);
	persistenceTail = persistenceTail
		.catch((error) => console.error(error))
		.then(() => store.set(key(hostId), value));
}

function emit(next: WorkbenchSnapshot, persist = true) {
	snapshot = finalize(next);
	for (const listener of listeners) listener();
	if (persist) queuePersistence(snapshot);
}

export function subscribeWorkbench(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getWorkbenchSnapshot() {
	return snapshot;
}

export function getWorkbenchSurface(id: string) {
	return snapshot.surfaces.find((surface) => surface.id === id) ?? null;
}

export function openWorkbenchSurface(
	surface: WorkbenchSurface,
	options: { groupId?: string } = {},
) {
	const existing = snapshot.surfaces.find((item) => item.id === surface.id);
	if (existing) {
		const location = findWorkbenchTab(snapshot.root, surface.id);
		if (!location) return;
		emit({
			...snapshot,
			surfaces: snapshot.surfaces.map((item) =>
				item.id === surface.id
					? ({ ...item, ...surface } as WorkbenchSurface)
					: item,
			),
			root: activateWorkbenchGroupTab(
				snapshot.root,
				location.group.id,
				surface.id,
			),
			focusedGroupId: location.group.id,
		});
		return;
	}

	const focusedGroupId = resolveFocus(
		snapshot.root,
		options.groupId ?? snapshot.focusedGroupId,
	);
	const root = updateWorkbenchGroup(snapshot.root, focusedGroupId, (group) => ({
		...group,
		tabs: [...group.tabs, { surfaceId: surface.id, pinned: false }],
		activeId: surface.id,
	}));
	emit({
		...snapshot,
		surfaces: [...snapshot.surfaces, surface],
		root,
		focusedGroupId,
	});
}

export function openWorkbenchDialog(surface: WorkbenchSurface) {
	emit({ ...snapshot, dialog: surface }, false);
}

export function closeWorkbenchDialog(id?: string) {
	if (id && snapshot.dialog?.id !== id) return;
	emit({ ...snapshot, dialog: null }, false);
}

export function focusWorkbenchGroup(groupId: string) {
	if (
		snapshot.focusedGroupId === groupId ||
		!findWorkbenchGroup(snapshot.root, groupId)
	) {
		return;
	}
	emit({ ...snapshot, focusedGroupId: groupId });
}

export function activateWorkbenchSurface(id: string) {
	const location = findWorkbenchTab(snapshot.root, id);
	if (!location) return;
	if (
		snapshot.focusedGroupId === location.group.id &&
		location.group.activeId === id
	) {
		return;
	}
	emit({
		...snapshot,
		root: activateWorkbenchGroupTab(snapshot.root, location.group.id, id),
		focusedGroupId: location.group.id,
	});
}

export function moveWorkbenchSurface(
	id: string,
	targetGroupId: string,
	targetIndex?: number,
) {
	const root = moveWorkbenchTab(snapshot.root, id, targetGroupId, targetIndex);
	if (root === snapshot.root) return false;
	const location = findWorkbenchTab(root, id);
	emit({
		...snapshot,
		root,
		focusedGroupId: location?.group.id ?? snapshot.focusedGroupId,
	});
	return true;
}

export function splitWorkbenchSurface(
	id: string,
	targetGroupId: string,
	direction: SplitDirection,
) {
	const root = splitWorkbenchGroupWithTab(
		snapshot.root,
		id,
		targetGroupId,
		direction,
	);
	if (root === snapshot.root) return false;
	const location = findWorkbenchTab(root, id);
	emit({
		...snapshot,
		root,
		focusedGroupId: location?.group.id ?? snapshot.focusedGroupId,
	});
	return true;
}

export function setWorkbenchSurfacePinned(id: string, pinned: boolean) {
	const root = setWorkbenchTabPinned(snapshot.root, id, pinned);
	if (root === snapshot.root) return;
	emit({ ...snapshot, root });
}

export function resizeWorkbenchLayoutSplit(
	splitId: string,
	ratio: number,
	options: { persist?: boolean } = {},
) {
	const root = resizeWorkbenchSplit(snapshot.root, splitId, ratio);
	if (root === snapshot.root) return;
	emit({ ...snapshot, root }, options.persist ?? true);
}

export function persistWorkbenchSnapshot() {
	queuePersistence(snapshot);
}

export function updateWorkbenchSurface(
	id: string,
	patch: Partial<WorkbenchSurface> & { sessionId?: string },
) {
	const index = snapshot.surfaces.findIndex((surface) => surface.id === id);
	if (index < 0) return;
	const surfaces = [...snapshot.surfaces];
	surfaces[index] = { ...surfaces[index], ...patch } as WorkbenchSurface;
	const persist = Object.keys(patch).some((key) => key !== "dirty");
	emit({ ...snapshot, surfaces }, persist);
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

export async function canCloseWorkbenchSurfaces(
	ids: Iterable<string>,
	context: WorkbenchCloseContext = { reason: "bulk" },
) {
	for (const id of new Set(ids)) {
		const guard = closeGuards.get(id);
		if (guard && !(await guard(context))) return false;
	}
	return true;
}

export function commitCloseWorkbenchSurfaces(ids: Iterable<string>) {
	const removed = new Set(ids);
	if (removed.size === 0) return true;
	const existing = snapshot.surfaces.filter((surface) =>
		removed.has(surface.id),
	);
	if (existing.length === 0) return true;
	for (const surface of existing) {
		closeGuards.delete(surface.id);
		if (commandHandlers.delete(surface.id)) emitCommandState();
	}
	const root = removeWorkbenchTabs(snapshot.root, removed);
	const focusedGroupId = findWorkbenchGroup(root, snapshot.focusedGroupId)
		? snapshot.focusedGroupId
		: nearestSurvivingGroup(snapshot.root, snapshot.focusedGroupId, root);
	emit({
		...snapshot,
		surfaces: snapshot.surfaces.filter((surface) => !removed.has(surface.id)),
		root,
		focusedGroupId,
	});
	return true;
}

export async function closeWorkbenchSurfaces(
	ids: Iterable<string>,
	context: WorkbenchCloseContext = { reason: "bulk" },
) {
	const captured = [...new Set(ids)];
	if (!(await canCloseWorkbenchSurfaces(captured, context))) return false;
	return commitCloseWorkbenchSurfaces(captured);
}

export async function closeWorkbenchSurface(id: string) {
	return closeWorkbenchSurfaces([id], { reason: "tab" });
}

export function registerWorkbenchCloseGuard(id: string, guard: CloseGuard) {
	closeGuards.set(id, guard);
	return () => {
		if (closeGuards.get(id) === guard) closeGuards.delete(id);
	};
}

function deserialize(
	saved: PersistedWorkbenchV2 | LegacyPersistedWorkbench | null,
	hostId: string,
	liveTerminalIds?: Set<string>,
): WorkbenchSnapshot {
	if (
		saved &&
		typeof saved === "object" &&
		"version" in saved &&
		saved.version === PERSISTENCE_VERSION
	) {
		const surfaces = Array.isArray(saved.surfaces)
			? saved.surfaces.filter((surface) =>
					canRestoreSurface(surface, liveTerminalIds),
				)
			: [];
		const root = repairLayout(
			isLayoutNode(saved.root)
				? saved.root
				: createWorkbenchGroup(ROOT_GROUP_ID),
			surfaces,
		);
		return finalize({
			surfaces,
			root,
			focusedGroupId: resolveFocus(root, saved.focusedGroupId),
			activeId: null,
			hostId,
			dialog: null,
		});
	}

	const legacy = saved as LegacyPersistedWorkbench | null;
	const surfaces = Array.isArray(legacy?.tabs)
		? legacy.tabs.filter((surface) =>
				canRestoreSurface(surface, liveTerminalIds),
			)
		: [];
	const preferred = surfaces.some((surface) => surface.id === legacy?.activeId)
		? (legacy?.activeId ?? null)
		: (surfaces[0]?.id ?? null);
	const root = createWorkbenchGroup(
		ROOT_GROUP_ID,
		surfaces.map((surface) => ({ surfaceId: surface.id, pinned: false })),
		preferred,
	);
	return finalize({
		surfaces,
		root,
		focusedGroupId: ROOT_GROUP_ID,
		activeId: preferred,
		hostId,
		dialog: null,
	});
}

export async function restoreWorkbench(
	hostId: string,
	liveTerminalIds?: Set<string>,
) {
	if (!hostId) {
		emit(emptySnapshot(), false);
		return;
	}
	if (snapshot.hostId === hostId) return;
	const saved = await store.get<
		PersistedWorkbenchV2 | LegacyPersistedWorkbench
	>(key(hostId));
	emit(deserialize(saved, hostId, liveTerminalIds), false);
}

export function pruneWorkbenchTerminals(liveTerminalIds: Set<string>) {
	const removed = snapshot.surfaces
		.filter(
			(surface) =>
				surface.kind === "terminal" && !liveTerminalIds.has(surface.terminalId),
		)
		.map((surface) => surface.id);
	if (removed.length > 0) commitCloseWorkbenchSurfaces(removed);
}

export function getWorkbenchSubtreeSurfaceIds(nodeId: string) {
	const node = findWorkbenchNode(snapshot.root, nodeId);
	return node ? collectWorkbenchSurfaceIds(node) : [];
}

export function resetWorkbench() {
	closeGuards.clear();
	commandHandlers.clear();
	emitCommandState();
	emit(emptySnapshot(), false);
}
