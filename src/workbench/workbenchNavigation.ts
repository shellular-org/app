import {
	findWorkbenchGroup,
	findWorkbenchTab,
	workbenchGroups,
} from "./layoutTree";
import type {
	WorkbenchGroupNode,
	WorkbenchLayoutNode,
	WorkbenchSnapshot,
} from "./types";

export type PaneDirection = "left" | "right" | "up" | "down";

interface PaneRect {
	group: WorkbenchGroupNode;
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export function adjacentTabId(snapshot: WorkbenchSnapshot, direction: -1 | 1) {
	const group = findWorkbenchGroup(snapshot.root, snapshot.focusedGroupId);
	if (!group?.tabs.length) return null;
	const activeIndex = Math.max(
		0,
		group.tabs.findIndex((tab) => tab.surfaceId === group.activeId),
	);
	const index =
		(activeIndex + direction + group.tabs.length) % group.tabs.length;
	return group.tabs[index]?.surfaceId ?? null;
}

export function numberedPaneId(root: WorkbenchLayoutNode, number: number) {
	return workbenchGroups(root)[number - 1]?.id ?? null;
}

export function adjacentPaneId(
	root: WorkbenchLayoutNode,
	groupId: string,
	direction: PaneDirection,
) {
	const panes = paneRects(root);
	const source = panes.find((pane) => pane.group.id === groupId);
	if (!source) return null;
	const sourceX = (source.left + source.right) / 2;
	const sourceY = (source.top + source.bottom) / 2;
	const candidates = panes
		.filter((pane) => pane.group.id !== groupId)
		.map((pane) => {
			const x = (pane.left + pane.right) / 2;
			const y = (pane.top + pane.bottom) / 2;
			const primary =
				direction === "left"
					? source.left - pane.right
					: direction === "right"
						? pane.left - source.right
						: direction === "up"
							? source.top - pane.bottom
							: pane.top - source.bottom;
			const secondary =
				direction === "left" || direction === "right"
					? Math.abs(y - sourceY)
					: Math.abs(x - sourceX);
			return { pane, primary, secondary };
		})
		.filter((candidate) => candidate.primary >= -Number.EPSILON)
		.sort(
			(left, right) =>
				left.primary - right.primary || left.secondary - right.secondary,
		);
	return candidates[0]?.pane.group.id ?? null;
}

export function reorderedTabTarget(
	snapshot: WorkbenchSnapshot,
	direction: -1 | 1,
) {
	if (!snapshot.activeId) return null;
	const location = findWorkbenchTab(snapshot.root, snapshot.activeId);
	if (!location || location.group.tabs.length < 2) return null;
	const targetIndex = Math.max(
		0,
		Math.min(location.group.tabs.length - 1, location.index + direction),
	);
	if (targetIndex === location.index) return null;
	return {
		surfaceId: snapshot.activeId,
		groupId: location.group.id,
		index: targetIndex,
	};
}

export function adjacentPaneMoveTarget(
	snapshot: WorkbenchSnapshot,
	direction: -1 | 1,
) {
	if (!snapshot.activeId) return null;
	const groups = workbenchGroups(snapshot.root);
	if (groups.length < 2) return null;
	const currentIndex = groups.findIndex(
		(group) => group.id === snapshot.focusedGroupId,
	);
	if (currentIndex < 0) return null;
	const target =
		groups[(currentIndex + direction + groups.length) % groups.length];
	return target ? { surfaceId: snapshot.activeId, groupId: target.id } : null;
}

export function focusedPaneTabIds(snapshot: WorkbenchSnapshot) {
	return (
		findWorkbenchGroup(snapshot.root, snapshot.focusedGroupId)?.tabs.map(
			(tab) => tab.surfaceId,
		) ?? []
	);
}

export function otherTabIds(snapshot: WorkbenchSnapshot) {
	return focusedPaneTabIds(snapshot).filter(
		(surfaceId) => surfaceId !== snapshot.activeId,
	);
}

export function rightTabIds(snapshot: WorkbenchSnapshot) {
	if (!snapshot.activeId) return [];
	const location = findWorkbenchTab(snapshot.root, snapshot.activeId);
	return (
		location?.group.tabs
			.slice(location.index + 1)
			.map((tab) => tab.surfaceId) ?? []
	);
}

function paneRects(root: WorkbenchLayoutNode) {
	const result: PaneRect[] = [];
	const visit = (
		node: WorkbenchLayoutNode,
		left: number,
		top: number,
		right: number,
		bottom: number,
	) => {
		if (node.type === "group") {
			result.push({ group: node, left, top, right, bottom });
			return;
		}
		if (node.orientation === "horizontal") {
			const split = left + (right - left) * node.ratio;
			visit(node.first, left, top, split, bottom);
			visit(node.second, split, top, right, bottom);
			return;
		}
		const split = top + (bottom - top) * node.ratio;
		visit(node.first, left, top, right, split);
		visit(node.second, left, split, right, bottom);
	};
	visit(root, 0, 0, 1, 1);
	return result;
}
