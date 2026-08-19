import type { AcpMessagePart, AiBackend } from "@shellular/protocol";
import { type ActivityKind, deriveActivityRow } from "./activityRow";
import { elidePath } from "./elide";
import type { ToolCallPart } from "./messageParts";

export type WorkLogRow =
	| { kind: "part"; part: AcpMessagePart }
	| { kind: "folded"; verb: string; directory?: string; parts: ToolCallPart[] };

export interface WorkLogLayout {
	/** Rows collapsed behind the "N earlier steps" control at the top. */
	hidden: number;
	rows: WorkLogRow[];
}

const FOLD_THRESHOLD = 3;
const FOLDABLE_KINDS = new Set<ActivityKind>(["read", "change"]);
export const WINDOW_SIZE = 6;

/**
 * Consecutive touches of the same file collapse to the last one, at any count.
 * This is not the same decision as folding a run: those rows differ only in a
 * basename, these differ in nothing at all. Devin ships the identical rule.
 *
 * Note the adjacency caveat: an interleaved unrelated part breaks the run. That
 * is deliberate here, because merging across an interruption would reorder the
 * timeline, but it is a known failure mode of adjacency-based coalescing and
 * Claude Code shipped a fix for the identical bug in v2.1.235.
 */
export function mergeSameFileRuns(
	parts: readonly AcpMessagePart[],
	backend?: AiBackend,
): AcpMessagePart[] {
	const output: AcpMessagePart[] = [];
	for (const part of parts) {
		const previous = output[output.length - 1];
		if (
			part.type === "tool_call" &&
			previous?.type === "tool_call" &&
			isSameFileTouch(previous, part, backend)
		) {
			output[output.length - 1] = part;
			continue;
		}
		output.push(part);
	}
	return output;
}

function isSameFileTouch(
	previous: ToolCallPart,
	current: ToolCallPart,
	backend?: AiBackend,
): boolean {
	const a = deriveActivityRow(previous, backend);
	const b = deriveActivityRow(current, backend);
	if (a.kind !== b.kind || !FOLDABLE_KINDS.has(a.kind)) return false;
	return Boolean(a.objectFull) && a.objectFull === b.objectFull;
}

/**
 * Folding is only honest when the folded rows would otherwise be redundant.
 * The longest measured run is 25 commands with 25 distinct descriptions, so
 * folding those would trade 25 sentences for one number. File runs differ only
 * in a basename, which the chips keep.
 */
export function foldPathRuns(
	parts: readonly AcpMessagePart[],
	backend?: AiBackend,
): WorkLogRow[] {
	const rows: WorkLogRow[] = [];
	let batch: ToolCallPart[] = [];
	let batchKind: ActivityKind | undefined;

	const flush = () => {
		if (batch.length >= FOLD_THRESHOLD && batchKind) {
			rows.push({
				kind: "folded",
				verb: `${batchKind === "read" ? "Read" : "Changed"} ${batch.length} files`,
				directory: sharedDirectory(batch, backend),
				parts: batch,
			});
		} else {
			for (const part of batch) rows.push({ kind: "part", part });
		}
		batch = [];
		batchKind = undefined;
	};

	for (const part of parts) {
		const kind =
			part.type === "tool_call"
				? deriveActivityRow(part, backend).kind
				: undefined;
		if (kind && FOLDABLE_KINDS.has(kind)) {
			if (batchKind && kind !== batchKind) flush();
			batchKind = kind;
			batch.push(part as ToolCallPart);
			continue;
		}
		flush();
		rows.push({ kind: "part", part });
	}
	flush();
	return rows;
}

/** Windowing hides rows behind a control; folding replaces them with a summary. */
export function windowRows(
	rows: readonly WorkLogRow[],
	size: number = WINDOW_SIZE,
): WorkLogLayout {
	if (rows.length <= size) return { hidden: 0, rows: [...rows] };
	return { hidden: rows.length - size, rows: rows.slice(rows.length - size) };
}

/**
 * The latest commentary is promoted to the turn header, so the reader sees
 * where the agent is going without scrolling to the end of the rail. Earlier
 * commentary stays in place: it belongs to the step it followed.
 */
export function splitCommentary(parts: readonly AcpMessagePart[]): {
	commentary?: string;
	rest: AcpMessagePart[];
} {
	let index = -1;
	for (let cursor = parts.length - 1; cursor >= 0; cursor -= 1) {
		const part = parts[cursor];
		if (part.type === "reasoning" && part.content?.trim()) {
			index = cursor;
			break;
		}
		if (part.type === "text" && part.text?.trim() && index < 0) index = cursor;
	}
	if (index < 0) return { rest: [...parts] };
	const part = parts[index];
	const commentary =
		part.type === "reasoning"
			? part.content.trim()
			: (part as { text: string }).text.trim();
	return { commentary, rest: parts.filter((_, cursor) => cursor !== index) };
}

/** Counts for the settled fold header, using the same classifier as the rows. */
export function countByKind(
	parts: readonly AcpMessagePart[],
	backend?: AiBackend,
): {
	counts: Array<{ kind: ActivityKind; count: number }>;
	failed: number;
} {
	const counts = new Map<ActivityKind, number>();
	let failed = 0;
	for (const part of parts) {
		if (part.type !== "tool_call") continue;
		const row = deriveActivityRow(part, backend);
		counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
		if (row.failed) failed += 1;
	}
	return {
		counts: Array.from(counts, ([kind, count]) => ({ kind, count })),
		failed,
	};
}

function sharedDirectory(
	parts: readonly ToolCallPart[],
	backend?: AiBackend,
): string | undefined {
	// Compare the real paths, not the elided ones: eliding keeps as much of the
	// tail as fits, so two files in the same directory whose basenames differ in
	// length end up with different visible prefixes and would never match.
	const directories = parts.map((part) => {
		const full = deriveActivityRow(part, backend).objectFull ?? "";
		const cut = full.lastIndexOf("/");
		return cut > 0 ? full.slice(0, cut) : "";
	});
	const first = directories[0];
	return first && directories.every((value) => value === first)
		? elidePath(first)
		: undefined;
}
