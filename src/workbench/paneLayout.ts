export interface PaneLayoutEntry {
	expanded: boolean;
	weight: number;
}

export type PaneLayoutState = Record<string, PaneLayoutEntry>;

export const DEFAULT_PANE_LAYOUT: PaneLayoutEntry = {
	expanded: true,
	weight: 1,
};

export function normalizedExpandedPaneWeights<T extends PaneLayoutEntry>(
	entries: T[],
) {
	const expanded = entries.filter((entry) => entry.expanded);
	const total = expanded.reduce((sum, entry) => sum + entry.weight, 0);
	if (expanded.length === 0 || total <= 0) return new Map<T, number>();
	const scale = expanded.length / total;
	return new Map(expanded.map((entry) => [entry, entry.weight * scale]));
}

export function normalizePaneLayout(
	ids: string[],
	saved?: unknown,
): PaneLayoutState {
	const source = isRecord(saved) ? saved : {};
	return Object.fromEntries(
		ids.map((id) => {
			const entry = isRecord(source[id]) ? source[id] : {};
			return [
				id,
				{
					expanded:
						typeof entry.expanded === "boolean"
							? entry.expanded
							: DEFAULT_PANE_LAYOUT.expanded,
					weight:
						typeof entry.weight === "number" &&
						Number.isFinite(entry.weight) &&
						entry.weight > 0
							? entry.weight
							: DEFAULT_PANE_LAYOUT.weight,
				},
			];
		}),
	);
}

export function resizePanePair<T extends PaneLayoutEntry>(
	layout: Record<string, T>,
	beforeId: string,
	afterId: string,
	deltaWeight: number,
	minimumWeight: number,
): Record<string, T> {
	const before = layout[beforeId];
	const after = layout[afterId];
	if (!before || !after || !before.expanded || !after.expanded) return layout;
	const total = before.weight + after.weight;
	const nextBefore = Math.min(
		total - minimumWeight,
		Math.max(minimumWeight, before.weight + deltaWeight),
	);
	if (!Number.isFinite(nextBefore) || nextBefore === before.weight)
		return layout;
	return {
		...layout,
		[beforeId]: { ...before, weight: nextBefore },
		[afterId]: { ...after, weight: total - nextBefore },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
