import type { ContextMenuAnchor } from "./types";

export interface MenuViewport {
	left: number;
	top: number;
	width: number;
	height: number;
}

export function placeContextMenu(
	anchor: ContextMenuAnchor,
	menu: { width: number; height: number },
	viewport: MenuViewport,
	margin = 8,
) {
	const preferredX = anchor.kind === "point" ? anchor.x : anchor.left;
	const preferredY = anchor.kind === "point" ? anchor.y : anchor.bottom;
	const alternateX = anchor.kind === "point" ? anchor.x : anchor.right;
	const alternateY = anchor.kind === "point" ? anchor.y : anchor.top;
	const minX = viewport.left + margin;
	const minY = viewport.top + margin;
	const maxX = viewport.left + viewport.width - menu.width - margin;
	const maxY = viewport.top + viewport.height - menu.height - margin;
	let left = preferredX;
	let top = preferredY;
	if (left > maxX) left = alternateX - menu.width;
	if (top > maxY) top = alternateY - menu.height;
	return {
		left: Math.max(minX, Math.min(left, Math.max(minX, maxX))),
		top: Math.max(minY, Math.min(top, Math.max(minY, maxY))),
		maxHeight: Math.max(40, viewport.height - margin * 2),
	};
}

export function currentVisualViewport(): MenuViewport {
	const viewport = window.visualViewport;
	return viewport
		? {
				left: viewport.offsetLeft,
				top: viewport.offsetTop,
				width: viewport.width,
				height: viewport.height,
			}
		: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}
