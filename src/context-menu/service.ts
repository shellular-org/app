import {
	cancelNativeContextMenu,
	showNativeContextMenu,
} from "bridge/contextMenu";
import toast from "lib/toast";
import type { MouseEvent as ReactMouseEvent } from "react";
import { getNativeContextMenuViewport, toLayoutViewportAnchor } from "./native";
import {
	executeContextCommand,
	resolveCommandGroups,
	resolveContextMenu,
} from "./registry";
import type {
	CommandId,
	ContextMenuInvocation,
	ResolvedMenuItem,
} from "./types";

export interface BrowserContextMenuSnapshot {
	id: number;
	invocation: ContextMenuInvocation;
	items: ResolvedMenuItem[];
}

let nextId = 0;
let snapshot: BrowserContextMenuSnapshot | null = null;
const browserCompletions = new Map<number, (executed: boolean) => void>();
const listeners = new Set<() => void>();

export function subscribeContextMenu(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getContextMenuSnapshot() {
	return snapshot;
}

export async function showContextMenu(invocation: ContextMenuInvocation) {
	const items = invocation.commandGroups
		? resolveCommandGroups(invocation.commandGroups, invocation.target)
		: resolveContextMenu(invocation.menuId, invocation.target);
	return presentContextMenu(invocation, items);
}

export async function showResolvedContextMenu(
	invocation: ContextMenuInvocation,
	items: ResolvedMenuItem[],
) {
	return presentContextMenu(invocation, items);
}

async function presentContextMenu(
	invocation: ContextMenuInvocation,
	items: ResolvedMenuItem[],
) {
	if (items.length === 0) return false;
	const id = ++nextId;
	if (process.env.IS_MACOS) {
		try {
			const viewport = getNativeContextMenuViewport();
			const command = await showNativeContextMenu({
				id,
				trigger: invocation.trigger,
				anchor: toLayoutViewportAnchor(invocation.anchor, viewport),
				viewport,
				items,
			});
			if (id !== nextId || !command) return false;
			return await executeSafely(invocation, command);
		} catch (error) {
			console.error("Native context menu failed", error);
			toast("Context menu is unavailable", 3000);
			return false;
		}
	}
	if (snapshot) dismissContextMenu(false);
	snapshot = { id, invocation, items };
	emit();
	return new Promise<boolean>((resolve) => {
		browserCompletions.set(id, resolve);
	});
}

export function showContextMenuForEvent(
	event: MouseEvent | ReactMouseEvent,
	invocation: Omit<ContextMenuInvocation, "anchor" | "origin" | "trigger">,
) {
	event.preventDefault();
	event.stopPropagation();
	const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
	const target =
		nativeEvent.target instanceof HTMLElement ? nativeEvent.target : null;
	const bounds = target?.getBoundingClientRect();
	const anchor =
		nativeEvent.clientX || nativeEvent.clientY || !bounds
			? {
					kind: "point" as const,
					x: nativeEvent.clientX,
					y: nativeEvent.clientY,
				}
			: {
					kind: "rect" as const,
					left: bounds.left,
					top: bounds.top,
					right: bounds.right,
					bottom: bounds.bottom,
				};
	return showContextMenu({
		...invocation,
		anchor,
		trigger: contextMenuTriggerForEvent(nativeEvent),
		origin: target,
	});
}

export function contextMenuTriggerForEvent(event: MouseEvent) {
	return event.button !== 2 &&
		!event.ctrlKey &&
		!event.clientX &&
		!event.clientY
		? ("keyboard" as const)
		: ("context" as const);
}

export async function selectContextMenuCommand(id: number, command: CommandId) {
	if (!snapshot || snapshot.id !== id) return false;
	const invocation = snapshot.invocation;
	const completion = browserCompletions.get(id);
	browserCompletions.delete(id);
	snapshot = null;
	nextId += 1;
	emit();
	const executed = await executeSafely(invocation, command);
	completion?.(executed);
	if (invocation.origin?.isConnected) {
		invocation.origin.focus({ preventScroll: true });
	}
	return executed;
}

export function dismissContextMenu(restoreFocus = true) {
	nextId += 1;
	const previous = snapshot;
	snapshot = null;
	if (previous) emit();
	if (previous) {
		browserCompletions.get(previous.id)?.(false);
		browserCompletions.delete(previous.id);
	}
	if (process.env.IS_MACOS) void cancelNativeContextMenu().catch(() => {});
	if (restoreFocus && previous?.invocation.origin?.isConnected) {
		previous.invocation.origin.focus({ preventScroll: true });
	}
}

async function executeSafely(
	invocation: ContextMenuInvocation,
	command: CommandId,
) {
	try {
		return await executeContextCommand(invocation.target, command);
	} catch (error) {
		console.error(`Context command ${command} failed`, error);
		toast("The command could not be completed", 3000);
		return false;
	}
}

function emit() {
	for (const listener of listeners) listener();
}
