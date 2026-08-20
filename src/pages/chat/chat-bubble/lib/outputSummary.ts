import { stripAnsi } from "./utils";

export interface OutputSummary {
	/** `inline` is a plain second line on the row; `peek` is the faded block. */
	mode: "inline" | "peek";
	lines: string[];
	lineCount: number;
	/** Too large to expand in place; the control should push a page instead. */
	needsFullView: boolean;
	/**
	 * Which end was cut, so the fade mask sits over the cut and not over data.
	 * Absent when nothing was cut, which is every inline summary.
	 */
	clipped?: "top" | "bottom";
}

const INLINE_MAX_LINES = 2;
const PEEK_LINES = 3;
/** Borrowed from the VS Code extension, which uses exactly 250. */
const FULL_VIEW_CHARS = 250;

/**
 * Half of all tool calls return a single line, so a boxed preview is the wrong
 * default: it spends a card's worth of vertical space on one word. Short output
 * becomes the row's own second line, and only longer output earns the block.
 * A failure always gets the block, because its output is the reason to look.
 */
export function summarizeToolOutput(
	output: string | undefined,
	options: { failed?: boolean; running?: boolean } = {},
): OutputSummary | null {
	if (!output) return null;
	const stripped = stripAnsi(output);
	const lines = stripped.split(/\r?\n/).map((line) => line.trimEnd());
	while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
	while (lines.length > 0 && !lines[0].trim()) lines.shift();
	if (lines.length === 0) return null;

	const needsFullView = stripped.trim().length > FULL_VIEW_CHARS;
	if (!options.failed && lines.length <= INLINE_MAX_LINES) {
		return { mode: "inline", lines, lineCount: lines.length, needsFullView };
	}

	// Which end to keep depends on the state, and getting this backwards is the
	// difference between watching a build and watching its first three lines
	// forever. A running command's newest output is the point; a failure's error
	// is at the end; a finished call is identified by the shape of its head.
	const fromTail = Boolean(options.running || options.failed);
	return {
		mode: "peek",
		lines: fromTail ? lines.slice(-PEEK_LINES) : lines.slice(0, PEEK_LINES),
		lineCount: lines.length,
		needsFullView,
		clipped: fromTail ? "top" : "bottom",
	};
}
