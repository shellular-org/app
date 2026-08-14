import type { SelectedLineRange, SelectionSide } from "@pierre/diffs";

export interface GitReviewComment {
	id: string;
	path: string;
	side: SelectionSide;
	startLine: number;
	endLine: number;
	body: string;
	code?: string;
}

export interface GitReviewLocation {
	side: SelectionSide;
	startLine: number;
	endLine: number;
}

export interface ParsedGitReviewPrompt {
	comments: GitReviewComment[];
	visibleText: string;
}

const REVIEW_START = '<shellular_git_review version="1">';
const REVIEW_END = "</shellular_git_review>";

export function normalizeReviewSelection(
	range: SelectedLineRange,
): GitReviewLocation {
	const startSide = range.side ?? "additions";
	const endSide = range.endSide ?? startSide;

	// A selection can cross old/new rows in a unified diff. That is ambiguous as
	// a review anchor, so use the row where the gesture ended as a single-line
	// comment instead of claiming one continuous range across two files.
	if (startSide !== endSide) {
		return { side: endSide, startLine: range.end, endLine: range.end };
	}

	return {
		side: startSide,
		startLine: Math.min(range.start, range.end),
		endLine: Math.max(range.start, range.end),
	};
}

export function getReviewCode(
	oldText: string,
	newText: string,
	location: GitReviewLocation,
) {
	const lines = (location.side === "additions" ? newText : oldText).split("\n");
	const selected = lines.slice(location.startLine - 1, location.endLine);
	const limit = 30;
	const context = selected
		.slice(0, limit)
		.map((line, index) => `${location.startLine + index}: ${line}`)
		.join("\n");
	return selected.length > limit
		? `${context}\n… ${selected.length - limit} more selected lines`
		: context;
}

export function formatGitReviewPrompt(comments: GitReviewComment[]) {
	if (!comments.length) return "";
	return `${REVIEW_START}\n${JSON.stringify({
		instruction:
			"Address every inline review comment in the current working tree. Use the file, side, line range, and code context to locate each requested change.",
		comments,
	})}\n${REVIEW_END}`;
}

export function parseGitReviewPrompt(
	text: string,
): ParsedGitReviewPrompt | null {
	const start = text.indexOf(REVIEW_START);
	if (start >= 0) {
		const end = text.indexOf(REVIEW_END, start + REVIEW_START.length);
		if (end < 0) return null;
		try {
			const payload = JSON.parse(
				text.slice(start + REVIEW_START.length, end).trim(),
			) as { comments?: unknown };
			const comments = readReviewComments(payload.comments);
			if (!comments.length) return null;
			return {
				comments,
				visibleText:
					`${text.slice(0, start)}${text.slice(end + REVIEW_END.length)}`.trim(),
			};
		} catch {
			return null;
		}
	}

	return null;
}

export function formatGitReviewSummary(comments: GitReviewComment[]) {
	return comments
		.map((comment) => {
			const side = comment.side === "additions" ? "new" : "old";
			const lines =
				comment.startLine === comment.endLine
					? String(comment.startLine)
					: `${comment.startLine}-${comment.endLine}`;
			return `- ${comment.path} (${side} line${comment.startLine === comment.endLine ? "" : "s"} ${lines}): ${comment.body}`;
		})
		.join("\n");
}

function readReviewComments(value: unknown): GitReviewComment[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry, index) => {
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		const side = record.side;
		if (
			typeof record.path !== "string" ||
			(side !== "additions" && side !== "deletions") ||
			typeof record.startLine !== "number" ||
			typeof record.endLine !== "number" ||
			typeof record.body !== "string"
		) {
			return [];
		}
		return [
			{
				id:
					typeof record.id === "string" ? record.id : `review-context-${index}`,
				path: record.path,
				side,
				startLine: record.startLine,
				endLine: record.endLine,
				body: record.body,
				code: typeof record.code === "string" ? record.code : undefined,
			},
		];
	});
}
