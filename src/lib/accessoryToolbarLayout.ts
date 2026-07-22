import {
	DEFAULT_TERMINAL_TOOLBAR_ROWS,
	TERMINAL_TOOLBAR_KEY_IDS,
	type TerminalToolbarKeyId,
} from "lib/settings";

export type ToolbarKeyPosition = {
	row: number;
	index: number;
};

export type TerminalToolbarKeyMeta = {
	label: string;
	/** Shorter label for dense demo keys */
	shortLabel?: string;
	icon?: string;
	description?: string;
};

/** Display metadata for terminal accessory keys (matches live toolbar). */
export const TERMINAL_TOOLBAR_KEY_META: Record<
	TerminalToolbarKeyId,
	TerminalToolbarKeyMeta
> = {
	esc: { label: "Esc", description: "Sends Escape" },
	tab: { label: "Tab", description: "Sends Tab" },
	ctrl: { label: "Ctrl", description: "Hold as a modifier" },
	alt: { label: "Alt", description: "Hold as a modifier" },
	shift: { label: "Shift", description: "Hold as a modifier" },
	home: { label: "Home", description: "Move to line start" },
	end: { label: "End", description: "Move to line end" },
	up: {
		label: "Up",
		icon: "icon-arrow-up",
		description: "Arrow up",
	},
	down: {
		label: "Down",
		icon: "icon-arrow-down",
		description: "Arrow down",
	},
	left: {
		label: "Left",
		icon: "icon-arrow-left",
		description: "Arrow left",
	},
	right: {
		label: "Right",
		icon: "icon-arrow-right",
		description: "Arrow right",
	},
	pageup: { label: "PgUp", shortLabel: "PgU", description: "Page up" },
	pagedown: { label: "PgDn", shortLabel: "PgD", description: "Page down" },
	interrupt: { label: "^C", description: "Send interrupt (Ctrl+C)" },
	switchTerminal: {
		label: "Switch",
		icon: "icon-repeat",
		description: "Cycle open terminals",
	},
	del: { label: "Del", description: "Forward delete" },
};

export function cloneToolbarRows(rows: string[][]): string[][] {
	return rows.map((row) => [...row]);
}

export function defaultToolbarRows(): string[][] {
	return DEFAULT_TERMINAL_TOOLBAR_ROWS.map((row) => [...row]);
}

export function isTerminalToolbarKeyId(id: string): id is TerminalToolbarKeyId {
	return (TERMINAL_TOOLBAR_KEY_IDS as readonly string[]).includes(id);
}

export function unusedToolbarKeys(rows: string[][]): TerminalToolbarKeyId[] {
	const used = new Set(rows.flat());
	return TERMINAL_TOOLBAR_KEY_IDS.filter((id) => !used.has(id));
}

export function findToolbarKey(
	rows: string[][],
	id: string,
): ToolbarKeyPosition | null {
	for (let row = 0; row < rows.length; row += 1) {
		const index = rows[row].indexOf(id);
		if (index >= 0) return { row, index };
	}
	return null;
}

function assertPosition(rows: string[][], pos: ToolbarKeyPosition): void {
	if (!rows[pos.row] || pos.index < 0 || pos.index >= rows[pos.row].length) {
		throw new Error("Invalid toolbar key position");
	}
}

/** Move a key within the same row. */
export function moveKeyWithinRow(
	rows: string[][],
	row: number,
	fromIndex: number,
	toIndex: number,
): string[][] {
	const next = cloneToolbarRows(rows);
	const list = next[row];
	if (!list || fromIndex === toIndex) return next;
	if (fromIndex < 0 || fromIndex >= list.length) return next;
	if (toIndex < 0 || toIndex >= list.length) return next;
	const [id] = list.splice(fromIndex, 1);
	list.splice(toIndex, 0, id);
	return next;
}

/** Move a key to the other row (defaults to end). */
export function moveKeyToRow(
	rows: string[][],
	from: ToolbarKeyPosition,
	toRow: number,
	toIndex?: number,
): string[][] {
	const next = cloneToolbarRows(rows);
	assertPosition(next, from);
	if (next[from.row].length <= 1) return rows;
	if (!next[toRow]) return rows;
	const [id] = next[from.row].splice(from.index, 1);
	const insertAt =
		toIndex === undefined
			? next[toRow].length
			: Math.max(0, Math.min(toIndex, next[toRow].length));
	next[toRow].splice(insertAt, 0, id);
	return next;
}

export function moveKeyLeft(
	rows: string[][],
	pos: ToolbarKeyPosition,
): string[][] {
	if (pos.index <= 0) return rows;
	return moveKeyWithinRow(rows, pos.row, pos.index, pos.index - 1);
}

export function moveKeyRight(
	rows: string[][],
	pos: ToolbarKeyPosition,
): string[][] {
	if (pos.index >= (rows[pos.row]?.length ?? 0) - 1) return rows;
	return moveKeyWithinRow(rows, pos.row, pos.index, pos.index + 1);
}

export function moveKeyToOtherRow(
	rows: string[][],
	pos: ToolbarKeyPosition,
): string[][] {
	const other = pos.row === 0 ? 1 : 0;
	return moveKeyToRow(rows, pos, other);
}

export function removeToolbarKey(
	rows: string[][],
	pos: ToolbarKeyPosition,
): string[][] {
	const next = cloneToolbarRows(rows);
	assertPosition(next, pos);
	if (next[pos.row].length <= 1) return rows;
	next[pos.row].splice(pos.index, 1);
	return next;
}

/**
 * Add an unused key to a row. No-ops if already present or not in catalog.
 * Defaults to the shorter row when `row` is omitted.
 */
export function addToolbarKey(
	rows: string[][],
	id: string,
	row?: number,
	at?: number,
): string[][] {
	if (!isTerminalToolbarKeyId(id)) return rows;
	if (findToolbarKey(rows, id)) return rows;
	const next = cloneToolbarRows(rows);
	const targetRow =
		row ??
		(next[0].length <= next[1].length ? 0 : 1);
	if (!next[targetRow]) return rows;
	const insertAt =
		at === undefined
			? next[targetRow].length
			: Math.max(0, Math.min(at, next[targetRow].length));
	next[targetRow].splice(insertAt, 0, id);
	return next;
}

/**
 * Replace the key at `pos` with `id`.
 * If `id` is already on the toolbar, swaps the two positions.
 */
export function replaceToolbarKey(
	rows: string[][],
	pos: ToolbarKeyPosition,
	id: string,
): string[][] {
	if (!isTerminalToolbarKeyId(id)) return rows;
	const next = cloneToolbarRows(rows);
	assertPosition(next, pos);
	const current = next[pos.row][pos.index];
	if (current === id) return rows;

	const existing = findToolbarKey(next, id);
	if (existing) {
		next[existing.row][existing.index] = current;
		next[pos.row][pos.index] = id;
		return next;
	}

	next[pos.row][pos.index] = id;
	return next;
}

export function toolbarKeyLabel(id: string): string {
	if (isTerminalToolbarKeyId(id)) {
		const meta = TERMINAL_TOOLBAR_KEY_META[id];
		return meta.shortLabel ?? meta.label;
	}
	return id;
}
