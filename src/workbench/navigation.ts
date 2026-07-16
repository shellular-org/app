import type { WorkbenchPresentation, WorkbenchSurface } from "./types";

type OpenOptions = { presentation?: WorkbenchPresentation };
type OpenHandler = (surface: WorkbenchSurface, options?: OpenOptions) => void;
let openHandler: OpenHandler | null = null;

export function setWorkbenchOpenHandler(handler: OpenHandler | null) {
	openHandler = handler;
}

/** Returns false on mobile so callers can use their existing page-stack flow. */
export function openInWorkbench(
	surface: WorkbenchSurface,
	options?: OpenOptions,
): boolean {
	if (!openHandler) return false;
	openHandler(surface, options);
	return true;
}
