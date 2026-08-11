import { nanoid } from "nanoid";
import type {
	WorkbenchGroupNode,
	WorkbenchLayoutNode,
	WorkbenchSplitNode,
	WorkbenchTabRef,
} from "./types";

export type SplitDirection = "left" | "right" | "up" | "down";

export interface WorkbenchMinimumSize {
	width: number;
	height: number;
}

export const WORKBENCH_MIN_GROUP_WIDTH = 240;
export const WORKBENCH_MIN_GROUP_HEIGHT = 160;
export const WORKBENCH_SASH_SIZE = 4;

export function createWorkbenchGroup(
	id = `group:${nanoid()}`,
	tabs: WorkbenchTabRef[] = [],
	activeId: string | null = tabs[0]?.surfaceId ?? null,
): WorkbenchGroupNode {
	return { type: "group", id, tabs, activeId };
}

export function workbenchGroups(root: WorkbenchLayoutNode) {
	const groups: WorkbenchGroupNode[] = [];
	visitWorkbenchGroups(root, (group) => groups.push(group));
	return groups;
}

export function visitWorkbenchGroups(
	node: WorkbenchLayoutNode,
	visit: (group: WorkbenchGroupNode) => void,
) {
	if (node.type === "group") {
		visit(node);
		return;
	}
	visitWorkbenchGroups(node.first, visit);
	visitWorkbenchGroups(node.second, visit);
}

export function findWorkbenchGroup(
	node: WorkbenchLayoutNode,
	groupId: string,
): WorkbenchGroupNode | null {
	if (node.type === "group") return node.id === groupId ? node : null;
	return (
		findWorkbenchGroup(node.first, groupId) ??
		findWorkbenchGroup(node.second, groupId)
	);
}

export function findWorkbenchNode(
	node: WorkbenchLayoutNode,
	nodeId: string,
): WorkbenchLayoutNode | null {
	if (node.id === nodeId) return node;
	if (node.type === "group") return null;
	return (
		findWorkbenchNode(node.first, nodeId) ??
		findWorkbenchNode(node.second, nodeId)
	);
}

export function findWorkbenchTab(
	root: WorkbenchLayoutNode,
	surfaceId: string,
): { group: WorkbenchGroupNode; tab: WorkbenchTabRef; index: number } | null {
	for (const group of workbenchGroups(root)) {
		const index = group.tabs.findIndex((tab) => tab.surfaceId === surfaceId);
		if (index >= 0) return { group, tab: group.tabs[index], index };
	}
	return null;
}

export function updateWorkbenchGroup(
	root: WorkbenchLayoutNode,
	groupId: string,
	update: (group: WorkbenchGroupNode) => WorkbenchGroupNode,
): WorkbenchLayoutNode {
	if (root.type === "group") return root.id === groupId ? update(root) : root;
	const first = updateWorkbenchGroup(root.first, groupId, update);
	const second = updateWorkbenchGroup(root.second, groupId, update);
	return first === root.first && second === root.second
		? root
		: { ...root, first, second };
}

export function updateWorkbenchSplit(
	root: WorkbenchLayoutNode,
	splitId: string,
	update: (split: WorkbenchSplitNode) => WorkbenchSplitNode,
): WorkbenchLayoutNode {
	if (root.type === "group") return root;
	if (root.id === splitId) return update(root);
	const first = updateWorkbenchSplit(root.first, splitId, update);
	const second = updateWorkbenchSplit(root.second, splitId, update);
	return first === root.first && second === root.second
		? root
		: { ...root, first, second };
}

export function activateWorkbenchGroupTab(
	root: WorkbenchLayoutNode,
	groupId: string,
	surfaceId: string,
) {
	return updateWorkbenchGroup(root, groupId, (group) =>
		group.tabs.some((tab) => tab.surfaceId === surfaceId)
			? { ...group, activeId: surfaceId }
			: group,
	);
}

function insertionIndex(
	tabs: WorkbenchTabRef[],
	pinned: boolean,
	requested?: number,
) {
	const pinnedCount = tabs.filter((tab) => tab.pinned).length;
	if (pinned) {
		return Math.max(0, Math.min(requested ?? pinnedCount, pinnedCount));
	}
	return Math.max(pinnedCount, Math.min(requested ?? tabs.length, tabs.length));
}

function withoutTab(group: WorkbenchGroupNode, surfaceId: string) {
	const index = group.tabs.findIndex((tab) => tab.surfaceId === surfaceId);
	if (index < 0) return group;
	const tabs = group.tabs.filter((tab) => tab.surfaceId !== surfaceId);
	const activeId =
		group.activeId === surfaceId
			? (tabs[Math.min(index, tabs.length - 1)]?.surfaceId ?? null)
			: group.activeId;
	return { ...group, tabs, activeId };
}

function withTab(
	group: WorkbenchGroupNode,
	tab: WorkbenchTabRef,
	requestedIndex?: number,
) {
	const tabs = group.tabs.filter((item) => item.surfaceId !== tab.surfaceId);
	const index = insertionIndex(tabs, tab.pinned, requestedIndex);
	tabs.splice(index, 0, tab);
	return { ...group, tabs, activeId: tab.surfaceId };
}

export function moveWorkbenchTab(
	root: WorkbenchLayoutNode,
	surfaceId: string,
	targetGroupId: string,
	targetIndex?: number,
): WorkbenchLayoutNode {
	const source = findWorkbenchTab(root, surfaceId);
	const target = findWorkbenchGroup(root, targetGroupId);
	if (!source || !target) return root;

	if (source.group.id === targetGroupId) {
		const remaining = source.group.tabs.filter(
			(tab) => tab.surfaceId !== surfaceId,
		);
		const index = insertionIndex(remaining, source.tab.pinned, targetIndex);
		remaining.splice(index, 0, source.tab);
		if (
			remaining.every(
				(tab, tabIndex) =>
					tab.surfaceId === source.group.tabs[tabIndex]?.surfaceId,
			)
		)
			return activateWorkbenchGroupTab(root, targetGroupId, surfaceId);
		return updateWorkbenchGroup(root, targetGroupId, (group) => ({
			...group,
			tabs: remaining,
			activeId: surfaceId,
		}));
	}

	let next = updateWorkbenchGroup(root, source.group.id, (group) =>
		withoutTab(group, surfaceId),
	);
	next = updateWorkbenchGroup(next, targetGroupId, (group) =>
		withTab(group, source.tab, targetIndex),
	);
	const emptied = findWorkbenchGroup(next, source.group.id);
	if (emptied?.tabs.length === 0 && workbenchGroups(next).length > 1) {
		next = removeWorkbenchNode(next, source.group.id) ?? next;
	}
	return next;
}

export function setWorkbenchTabPinned(
	root: WorkbenchLayoutNode,
	surfaceId: string,
	pinned: boolean,
) {
	const location = findWorkbenchTab(root, surfaceId);
	if (!location || location.tab.pinned === pinned) return root;
	return updateWorkbenchGroup(root, location.group.id, (group) => {
		const tabs = group.tabs.filter((tab) => tab.surfaceId !== surfaceId);
		const tab = { ...location.tab, pinned };
		tabs.splice(insertionIndex(tabs, pinned), 0, tab);
		return { ...group, tabs };
	});
}

export function removeWorkbenchTabs(
	root: WorkbenchLayoutNode,
	surfaceIds: Iterable<string>,
): WorkbenchLayoutNode {
	const removed = new Set(surfaceIds);
	if (removed.size === 0) return root;

	const prune = (node: WorkbenchLayoutNode): WorkbenchLayoutNode | null => {
		if (node.type === "group") {
			const originalActiveIndex = node.activeId
				? node.tabs.findIndex((tab) => tab.surfaceId === node.activeId)
				: -1;
			const tabs = node.tabs.filter((tab) => !removed.has(tab.surfaceId));
			if (tabs.length === node.tabs.length) return node;
			if (tabs.length === 0) return null;
			const activeId =
				node.activeId && tabs.some((tab) => tab.surfaceId === node.activeId)
					? node.activeId
					: (tabs[Math.min(Math.max(originalActiveIndex, 0), tabs.length - 1)]
							?.surfaceId ?? null);
			return { ...node, tabs, activeId };
		}
		const first = prune(node.first);
		const second = prune(node.second);
		if (!first) return second;
		if (!second) return first;
		return first === node.first && second === node.second
			? node
			: { ...node, first, second };
	};

	return prune(root) ?? createWorkbenchGroup("group:root");
}

export function splitWorkbenchGroupWithTab(
	root: WorkbenchLayoutNode,
	surfaceId: string,
	targetGroupId: string,
	direction: SplitDirection,
	ids: { splitId?: string; groupId?: string } = {},
): WorkbenchLayoutNode {
	const source = findWorkbenchTab(root, surfaceId);
	const target = findWorkbenchGroup(root, targetGroupId);
	if (!source || !target) return root;
	if (source.group.id === targetGroupId && source.group.tabs.length === 1) {
		return root;
	}

	let next = updateWorkbenchGroup(root, source.group.id, (group) =>
		withoutTab(group, surfaceId),
	);
	const liveTarget = findWorkbenchGroup(next, targetGroupId);
	if (!liveTarget) return root;
	const newGroup = createWorkbenchGroup(ids.groupId, [source.tab], surfaceId);
	const insertFirst = direction === "left" || direction === "up";
	const split: WorkbenchSplitNode = {
		type: "split",
		id: ids.splitId ?? `split:${nanoid()}`,
		orientation:
			direction === "left" || direction === "right" ? "horizontal" : "vertical",
		ratio: 0.5,
		first: insertFirst ? newGroup : liveTarget,
		second: insertFirst ? liveTarget : newGroup,
	};
	next = replaceWorkbenchNode(next, targetGroupId, () => split);
	const emptied = findWorkbenchGroup(next, source.group.id);
	if (emptied?.tabs.length === 0 && workbenchGroups(next).length > 1) {
		next = removeWorkbenchNode(next, source.group.id) ?? next;
	}
	return next;
}

export function replaceWorkbenchNode(
	root: WorkbenchLayoutNode,
	nodeId: string,
	replace: (node: WorkbenchLayoutNode) => WorkbenchLayoutNode,
): WorkbenchLayoutNode {
	if (root.id === nodeId) return replace(root);
	if (root.type === "group") return root;
	const first = replaceWorkbenchNode(root.first, nodeId, replace);
	const second = replaceWorkbenchNode(root.second, nodeId, replace);
	return first === root.first && second === root.second
		? root
		: { ...root, first, second };
}

export function removeWorkbenchNode(
	root: WorkbenchLayoutNode,
	nodeId: string,
): WorkbenchLayoutNode | null {
	if (root.id === nodeId) return null;
	if (root.type === "group") return root;
	if (root.first.id === nodeId) return root.second;
	if (root.second.id === nodeId) return root.first;
	const first = removeWorkbenchNode(root.first, nodeId);
	const second = removeWorkbenchNode(root.second, nodeId);
	if (!first) return second;
	if (!second) return first;
	return first === root.first && second === root.second
		? root
		: { ...root, first, second };
}

export function findParentWorkbenchSplit(
	root: WorkbenchLayoutNode,
	nodeId: string,
): WorkbenchSplitNode | null {
	if (root.type === "group") return null;
	if (root.first.id === nodeId || root.second.id === nodeId) return root;
	return (
		findParentWorkbenchSplit(root.first, nodeId) ??
		findParentWorkbenchSplit(root.second, nodeId)
	);
}

export function collectWorkbenchSurfaceIds(
	node: WorkbenchLayoutNode,
): string[] {
	if (node.type === "group") return node.tabs.map((tab) => tab.surfaceId);
	return [
		...collectWorkbenchSurfaceIds(node.first),
		...collectWorkbenchSurfaceIds(node.second),
	];
}

export function collectWorkbenchGroupIds(node: WorkbenchLayoutNode): string[] {
	if (node.type === "group") return [node.id];
	return [
		...collectWorkbenchGroupIds(node.first),
		...collectWorkbenchGroupIds(node.second),
	];
}

export function resizeWorkbenchSplit(
	root: WorkbenchLayoutNode,
	splitId: string,
	ratio: number,
) {
	if (!Number.isFinite(ratio)) return root;
	const clamped = Math.max(0.1, Math.min(0.9, ratio));
	return updateWorkbenchSplit(root, splitId, (split) =>
		split.ratio === clamped ? split : { ...split, ratio: clamped },
	);
}

export function workbenchMinimumSize(
	node: WorkbenchLayoutNode,
): WorkbenchMinimumSize {
	if (node.type === "group") {
		return {
			width: WORKBENCH_MIN_GROUP_WIDTH,
			height: WORKBENCH_MIN_GROUP_HEIGHT,
		};
	}
	const first = workbenchMinimumSize(node.first);
	const second = workbenchMinimumSize(node.second);
	if (node.orientation === "horizontal") {
		return {
			width: first.width + second.width + WORKBENCH_SASH_SIZE,
			height: Math.max(first.height, second.height),
		};
	}
	return {
		width: Math.max(first.width, second.width),
		height: first.height + second.height + WORKBENCH_SASH_SIZE,
	};
}

export function normalizeWorkbenchTree(
	root: WorkbenchLayoutNode,
	validSurfaceIds: Set<string>,
) {
	const seenSurfaces = new Set<string>();
	const seenNodes = new Set<string>();
	const normalize = (node: WorkbenchLayoutNode): WorkbenchLayoutNode | null => {
		if (seenNodes.has(node.id)) return null;
		seenNodes.add(node.id);
		if (node.type === "group") {
			const pinned: WorkbenchTabRef[] = [];
			const regular: WorkbenchTabRef[] = [];
			for (const tab of node.tabs) {
				if (
					!validSurfaceIds.has(tab.surfaceId) ||
					seenSurfaces.has(tab.surfaceId)
				)
					continue;
				seenSurfaces.add(tab.surfaceId);
				(tab.pinned ? pinned : regular).push({
					surfaceId: tab.surfaceId,
					pinned: Boolean(tab.pinned),
				});
			}
			const tabs = [...pinned, ...regular];
			return {
				type: "group",
				id: node.id,
				tabs,
				activeId: tabs.some((tab) => tab.surfaceId === node.activeId)
					? node.activeId
					: (tabs[0]?.surfaceId ?? null),
			};
		}
		const first = normalize(node.first);
		const second = normalize(node.second);
		if (!first) return second;
		if (!second) return first;
		if (
			first.type === "group" &&
			first.tabs.length === 0 &&
			collectWorkbenchSurfaceIds(second).length > 0
		)
			return second;
		if (
			second.type === "group" &&
			second.tabs.length === 0 &&
			collectWorkbenchSurfaceIds(first).length > 0
		)
			return first;
		return {
			type: "split",
			id: node.id,
			orientation: node.orientation === "vertical" ? "vertical" : "horizontal",
			ratio:
				typeof node.ratio === "number" && Number.isFinite(node.ratio)
					? Math.max(0.1, Math.min(0.9, node.ratio))
					: 0.5,
			first,
			second,
		};
	};
	return normalize(root) ?? createWorkbenchGroup("group:root");
}

export function validateWorkbenchTree(
	root: WorkbenchLayoutNode,
	knownSurfaceIds?: ReadonlySet<string>,
) {
	const errors: string[] = [];
	const nodeIds = new Set<string>();
	const surfaceIds = new Set<string>();
	const visit = (node: WorkbenchLayoutNode) => {
		if (nodeIds.has(node.id)) errors.push(`Duplicate node ID: ${node.id}`);
		nodeIds.add(node.id);
		if (node.type === "split") {
			if (
				!Number.isFinite(node.ratio) ||
				node.ratio < 0.1 ||
				node.ratio > 0.9
			) {
				errors.push(`Invalid split ratio: ${node.id}`);
			}
			visit(node.first);
			visit(node.second);
			return;
		}
		let regularSeen = false;
		for (const tab of node.tabs) {
			if (!tab.pinned) regularSeen = true;
			else if (regularSeen)
				errors.push(`Pinned tab is outside prefix: ${tab.surfaceId}`);
			if (surfaceIds.has(tab.surfaceId)) {
				errors.push(`Duplicate surface: ${tab.surfaceId}`);
			}
			if (knownSurfaceIds && !knownSurfaceIds.has(tab.surfaceId)) {
				errors.push(`Unknown surface: ${tab.surfaceId}`);
			}
			surfaceIds.add(tab.surfaceId);
		}
		if (
			node.activeId !== null &&
			!node.tabs.some((tab) => tab.surfaceId === node.activeId)
		) {
			errors.push(`Invalid active tab: ${node.id}`);
		}
	};
	visit(root);
	return { valid: errors.length === 0, errors };
}
