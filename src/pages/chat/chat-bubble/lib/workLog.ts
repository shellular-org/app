import type { AcpMessage, AcpMessagePart } from "@shellular/protocol";
import type { ToolCallPart } from "./messageParts";

export interface AssistantTurnProjection {
	/** The terminal assistant response that remains in the transcript. */
	answerParts: AcpMessagePart[];
	/** Commentary, reasoning and actions that belong in the turn work log. */
	workParts: AcpMessagePart[];
}

export type WorkLogGroup =
	| { kind: "actions"; parts: AcpMessagePart[] }
	| { kind: "content"; part: AcpMessagePart };

const WORK_PART_TYPES = new Set<AcpMessagePart["type"]>([
	"command",
	"file_change",
	"plan",
	"reasoning",
	"tool_call",
]);

/**
 * Projects the wire-shaped parts from a complete assistant turn into two UI
 * lanes: work and final answer. The boundary is the final work part, which
 * keeps commentary emitted between tool calls out of the terminal answer.
 */
export function projectAssistantTurn(
	messages: readonly AcpMessage[],
	streaming = false,
): AssistantTurnProjection {
	const parts = messages.flatMap((message) => message.parts);
	let lastWorkIndex = -1;
	for (let index = parts.length - 1; index >= 0; index -= 1) {
		if (WORK_PART_TYPES.has(parts[index].type)) {
			lastWorkIndex = index;
			break;
		}
	}

	if (lastWorkIndex < 0) {
		return { answerParts: parts, workParts: [] };
	}
	if (streaming) {
		return { answerParts: [], workParts: coalesceToolCalls(parts) };
	}

	return {
		answerParts: parts.slice(lastWorkIndex + 1),
		workParts: coalesceToolCalls(parts.slice(0, lastWorkIndex + 1)),
	};
}

/**
 * ACP tool updates are patches keyed by toolCallId. Some transcripts carry
 * more than one flattened part for that lifecycle, so collapse them before
 * rendering and keep the first position stable while applying later fields.
 */
export function coalesceToolCalls(
	parts: readonly AcpMessagePart[],
): AcpMessagePart[] {
	const output: AcpMessagePart[] = [];
	const indexById = new Map<string, number>();

	for (const part of parts) {
		if (part.type !== "tool_call" || !part.id) {
			output.push(part);
			continue;
		}
		const existingIndex = indexById.get(part.id);
		if (existingIndex === undefined) {
			indexById.set(part.id, output.length);
			output.push(part);
			continue;
		}
		output[existingIndex] = mergeToolCallParts(
			output[existingIndex] as ToolCallPart,
			part,
		);
	}

	return output;
}

/**
 * Preserve the agent's actual work cadence. Only consecutive actions belong
 * to one burst; commentary, reasoning and plans close that burst and anchor
 * the next one independently in the timeline.
 */
export function groupWorkLogParts(
	parts: readonly AcpMessagePart[],
): WorkLogGroup[] {
	const groups: WorkLogGroup[] = [];
	let actionBurst: AcpMessagePart[] = [];
	const flushActions = () => {
		if (actionBurst.length === 0) return;
		groups.push({ kind: "actions", parts: actionBurst });
		actionBurst = [];
	};

	for (const part of parts) {
		if (isWorkActionPart(part)) {
			actionBurst.push(part);
			continue;
		}
		flushActions();
		groups.push({ kind: "content", part });
	}
	flushActions();
	return groups;
}

export function isWorkActionPart(part: AcpMessagePart): boolean {
	return ["command", "file_change", "tool_call"].includes(part.type);
}

function mergeToolCallParts(
	previous: ToolCallPart,
	incoming: ToolCallPart,
): ToolCallPart {
	const previousLocations = readLocations(previous);
	const incomingLocations = readLocations(incoming);
	const locations = [...previousLocations];
	const seenLocations = new Set(
		locations.map(({ path, line }) => `${path}:${line ?? ""}`),
	);
	for (const location of incomingLocations) {
		const key = `${location.path}:${location.line ?? ""}`;
		if (!seenLocations.has(key)) {
			seenLocations.add(key);
			locations.push(location);
		}
	}

	const previousContent = readContentParts(previous);
	const incomingContent = readContentParts(incoming);
	return {
		...previous,
		...incoming,
		name: incoming.name || previous.name,
		title: incoming.title ?? previous.title,
		arguments: incoming.arguments ?? previous.arguments,
		status: incoming.status ?? previous.status,
		output: incoming.output ?? previous.output,
		parts: incomingContent.length > 0 ? incomingContent : previousContent,
		locations,
	} as ToolCallPart;
}

export function getAssistantTurnDurationMs(
	messages: readonly AcpMessage[],
	previousMessage?: AcpMessage,
): number | undefined {
	return getElapsedDurationMs(
		previousMessage?.timestamp ?? messages[0]?.timestamp,
		messages[messages.length - 1]?.timestamp,
	);
}

/** Normalize protocol seconds/milliseconds and reject stale turn boundaries. */
export function getElapsedDurationMs(
	startedAt: number | undefined,
	endedAt: number | undefined = Date.now(),
): number | undefined {
	const normalizedStart = timestampMs(startedAt);
	const normalizedEnd = timestampMs(endedAt);
	if (
		normalizedStart === undefined ||
		normalizedEnd === undefined ||
		normalizedEnd <= normalizedStart
	) {
		return undefined;
	}
	// A stale or malformed timestamp should not produce a fantastical work label.
	const duration = normalizedEnd - normalizedStart;
	return duration <= 24 * 60 * 60 * 1_000 ? duration : undefined;
}

export function formatWorkDuration(durationMs: number): string {
	if (durationMs < 1_000) return "under a second";
	if (durationMs < 10_000) {
		return `${(Math.round(durationMs / 100) / 10).toFixed(1)}s`;
	}
	const totalSeconds = Math.round(durationMs / 1_000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function readLocations(part: ToolCallPart) {
	const locations = (part as { locations?: unknown }).locations;
	if (!Array.isArray(locations)) return [];
	return locations.flatMap((value) => {
		if (!value || typeof value !== "object") return [];
		const location = value as Record<string, unknown>;
		if (typeof location.path !== "string" || !location.path) return [];
		return [
			{
				path: location.path,
				line: typeof location.line === "number" ? location.line : undefined,
			},
		];
	});
}

function readContentParts(part: ToolCallPart): AcpMessagePart[] {
	return Array.isArray((part as { parts?: unknown }).parts)
		? ((part as unknown as { parts: AcpMessagePart[] }).parts ?? [])
		: [];
}

function timestampMs(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value < 10_000_000_000 ? value * 1_000 : value;
}
