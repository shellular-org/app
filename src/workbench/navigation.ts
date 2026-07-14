import type { WorkbenchSurface } from "./types";

type OpenHandler = (surface: WorkbenchSurface) => void;
let openHandler: OpenHandler | null = null;

export function setWorkbenchOpenHandler(handler: OpenHandler | null) {
	openHandler = handler;
}

/** Returns false on mobile so callers can use their existing page-stack flow. */
export function openInWorkbench(surface: WorkbenchSurface): boolean {
	if (!openHandler) return false;
	openHandler(surface);
	return true;
}
