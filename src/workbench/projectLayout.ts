import { DEFAULT_PANE_LAYOUT } from "./paneLayout";

export { resizePanePair } from "./paneLayout";

export type ProjectPaneMode = "tree" | "sessions";

export interface ProjectPaneState {
	expanded: boolean;
	mode: ProjectPaneMode;
	weight: number;
}

export type ProjectLayoutState = Record<string, ProjectPaneState>;

export const DEFAULT_PROJECT_PANE: ProjectPaneState = {
	expanded: DEFAULT_PANE_LAYOUT.expanded,
	mode: "tree",
	weight: DEFAULT_PANE_LAYOUT.weight,
};

export function normalizeProjectLayout(
	paths: string[],
	saved?: unknown,
): ProjectLayoutState {
	const source = isRecord(saved) ? saved : {};
	return Object.fromEntries(
		paths.map((path) => {
			const entry = isRecord(source[path]) ? source[path] : {};
			return [
				path,
				{
					expanded:
						typeof entry.expanded === "boolean"
							? entry.expanded
							: DEFAULT_PROJECT_PANE.expanded,
					mode:
						entry.mode === "sessions" || entry.mode === "tree"
							? entry.mode
							: DEFAULT_PROJECT_PANE.mode,
					weight:
						typeof entry.weight === "number" &&
						Number.isFinite(entry.weight) &&
						entry.weight > 0
							? entry.weight
							: DEFAULT_PROJECT_PANE.weight,
				},
			];
		}),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
