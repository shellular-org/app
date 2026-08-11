import type { ContextMenuAnchor } from "./types";

export interface NativeContextMenuViewport {
	layoutWidth: number;
	layoutHeight: number;
	visualWidth: number;
	visualHeight: number;
	visualOffsetLeft: number;
	visualOffsetTop: number;
	visualScale: number;
	deviceScaleFactor: number;
}

export function getNativeContextMenuViewport(): NativeContextMenuViewport {
	const viewport = window.visualViewport;
	return {
		layoutWidth: window.innerWidth,
		layoutHeight: window.innerHeight,
		visualWidth: viewport?.width ?? window.innerWidth,
		visualHeight: viewport?.height ?? window.innerHeight,
		visualOffsetLeft: viewport?.offsetLeft ?? 0,
		visualOffsetTop: viewport?.offsetTop ?? 0,
		visualScale: viewport?.scale ?? 1,
		deviceScaleFactor: window.devicePixelRatio || 1,
	};
}

/**
 * Mouse events and DOMRects are relative to the visual viewport. Native code
 * receives layout-viewport coordinates so it can apply the WebView's actual
 * bounds, flipped state, and current visual viewport in one place.
 */
export function toLayoutViewportAnchor(
	anchor: ContextMenuAnchor,
	viewport: NativeContextMenuViewport,
): ContextMenuAnchor {
	const offsetX = viewport.visualOffsetLeft;
	const offsetY = viewport.visualOffsetTop;
	if (anchor.kind === "point") {
		return { kind: "point", x: anchor.x + offsetX, y: anchor.y + offsetY };
	}
	return {
		kind: "rect",
		left: anchor.left + offsetX,
		top: anchor.top + offsetY,
		right: anchor.right + offsetX,
		bottom: anchor.bottom + offsetY,
	};
}
