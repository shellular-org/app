import "./WorkLogView.scss";
import type { AcpMessagePart, AiBackend } from "@shellular/protocol";
import { memo, useMemo, useState } from "react";
import { type ActivityKind, deriveActivityRow } from "../lib/activityRow";
import { messagePartsToMarkdown, type ToolCallPart } from "../lib/messageParts";
import { getRenderPartKey } from "../lib/utils";
import {
	formatWorkDuration,
	groupWorkLogParts,
	type WorkLogGroup,
} from "../lib/workLog";
import {
	countByKind,
	foldPathRuns,
	mergeSameFileRuns,
	type WorkLogRow,
	windowRows,
} from "../lib/workLogLayout";
import ActivityRow from "./ActivityRow";
import ChatDisclosure from "./ChatDisclosure";
import MarkdownPart from "./MarkdownPart";
import MessagePartView from "./MessagePartView";
import ToolCallContentView from "./ToolCallContentView";
import { useWorkLogWindowSize } from "./useWorkLogWindowSize";

const KIND_NOUNS: Record<ActivityKind, string> = {
	execute: "ran",
	read: "read",
	change: "changed",
	search: "searched",
	fetch: "fetched",
	think: "thought",
	switch_mode: "mode",
	other: "other",
};

interface WorkLogViewProps {
	parts: AcpMessagePart[];
	streaming: boolean;
	stateKey: string;
	durationMs?: number;
	/** Which agent produced these parts; the row objects resolve per agent. */
	backend?: AiBackend;
}

const WorkLogView = memo(function WorkLogView({
	parts,
	streaming,
	stateKey,
	durationMs,
	backend,
}: WorkLogViewProps) {
	const windowSize = useWorkLogWindowSize();
	const visibleParts = useMemo(
		() => parts.filter((part) => shouldRenderWorkPart(part, streaming)),
		[parts, streaming],
	);
	const groups = useMemo(() => groupWorkLogParts(visibleParts), [visibleParts]);

	if (visibleParts.length === 0) return null;

	if (streaming) {
		return (
			<section
				className="chat-work-log chat-work-log--live"
				aria-label="Work log"
			>
				<WorkLogGroups
					groups={groups}
					keyPrefix={`${stateKey}-live`}
					windowSize={windowSize}
					backend={backend}
				/>
			</section>
		);
	}

	// A duration alone says how long, never what. The counts come from the same
	// classifier the rows use, and the failure count is never folded away:
	// it is the number that changes what the reader does next.
	const { counts, failed } = countByKind(visibleParts, backend);
	const durationLabel =
		durationMs === undefined
			? "Worked"
			: `Worked ${formatWorkDuration(durationMs)}`;
	const countLabel = [
		...counts.map(({ kind, count }) => `${count} ${KIND_NOUNS[kind]}`),
		...(failed > 0 ? [`${failed} failed`] : []),
	].join(" · ");
	return (
		<ChatDisclosure
			className="chat-work-log chat-work-log--settled"
			card={false}
			stateKey={`${stateKey}-settled`}
			copyText={() => messagePartsToMarkdown(visibleParts)}
			copyLabel="Copy work log"
			summary={
				<>
					<span
						className="icon-check chat-work-log-status"
						aria-hidden="true"
					/>
					<span className="chat-work-log-title">{durationLabel}</span>
					{countLabel ? (
						<span
							className={`chat-work-log-counts${failed > 0 ? " chat-work-log-counts--failed" : ""}`}
						>
							{` · ${countLabel}`}
						</span>
					) : null}
				</>
			}
		>
			<div className="chat-work-log-list">
				<WorkLogGroups
					groups={groups}
					keyPrefix={`${stateKey}-settled`}
					windowSize={windowSize}
					backend={backend}
				/>
			</div>
		</ChatDisclosure>
	);
});

export default WorkLogView;

function WorkLogGroups({
	groups,
	keyPrefix,
	windowSize,
	backend,
}: {
	groups: WorkLogGroup[];
	keyPrefix: string;
	windowSize: number;
	backend?: AiBackend;
}) {
	return groups.map((group, index) => {
		const firstPart = group.kind === "actions" ? group.parts[0] : group.part;
		const groupKey = `${keyPrefix}-group-${index}-${getRenderPartKey(firstPart, index)}`;
		if (group.kind === "actions") {
			return (
				<WorkActionGroup
					key={groupKey}
					parts={group.parts}
					stateKey={groupKey}
					windowSize={windowSize}
					backend={backend}
				/>
			);
		}
		return (
			<WorkPartList
				key={groupKey}
				parts={[group.part]}
				keyPrefix={groupKey}
				backend={backend}
			/>
		);
	});
}

/**
 * The full trail, newest-last, with anything past the window behind one control
 * at the top. Showing only the latest action while eight have run is the
 * behaviour users report as confusing; the window replaces it, and the
 * latest-only view survives as a `windowSize` of 1 rather than a second path.
 */
function WorkActionGroup({
	parts,
	stateKey,
	windowSize,
	backend,
}: {
	parts: AcpMessagePart[];
	stateKey: string;
	windowSize: number;
	backend?: AiBackend;
}) {
	const [expanded, setExpanded] = useState(false);
	const rows = useMemo(
		() => foldPathRuns(mergeSameFileRuns(parts, backend), backend),
		[parts, backend],
	);
	const layout = useMemo(
		() => (expanded ? { hidden: 0, rows } : windowRows(rows, windowSize)),
		[rows, expanded, windowSize],
	);

	return (
		<div className="chat-work-action-group">
			{layout.hidden > 0 ? (
				<button
					type="button"
					className="chat-work-log-earlier"
					aria-expanded={false}
					onClick={() => setExpanded(true)}
				>
					<span className="icon-chevron-down" aria-hidden="true" />
					<span>
						{`${layout.hidden} earlier ${layout.hidden === 1 ? "step" : "steps"}`}
					</span>
				</button>
			) : null}
			{layout.rows.map((row, index) => (
				<WorkLogRowView
					// biome-ignore lint/suspicious/noArrayIndexKey: the window is recomputed wholesale from the parts array, so a row's position is its identity and a folded row has no id of its own
					key={`${stateKey}-${index}-${rowKey(row, index)}`}
					row={row}
					stateKey={`${stateKey}-${index}`}
					backend={backend}
				/>
			))}
		</div>
	);
}

function rowKey(row: WorkLogRow, index: number): string {
	return row.kind === "part"
		? getRenderPartKey(row.part, index)
		: `folded-${row.parts.length}`;
}

function WorkLogRowView({
	row,
	stateKey,
	backend,
}: {
	row: WorkLogRow;
	stateKey: string;
	backend?: AiBackend;
}) {
	if (row.kind === "part") {
		return (
			<WorkPartList parts={[row.part]} keyPrefix={stateKey} backend={backend} />
		);
	}
	const chips = row.parts
		.map((part) => {
			const object = deriveActivityRow(part, backend).object ?? "";
			return object.slice(object.lastIndexOf("/") + 1);
		})
		.filter(Boolean);
	return (
		<ActivityRow
			row={{
				kind:
					row.parts.length > 0
						? deriveActivityRow(row.parts[0], backend).kind
						: "other",
				verb: row.verb,
				object: row.directory,
				objectIsMono: true,
				running: false,
				failed: false,
			}}
			chips={chips.slice(0, 3)}
			extraChips={Math.max(0, chips.length - 3)}
		/>
	);
}

function WorkPartList({
	parts,
	keyPrefix,
	backend,
}: {
	parts: AcpMessagePart[];
	keyPrefix: string;
	backend?: AiBackend;
}) {
	return parts.map((part, index) => {
		if (part.type === "text") {
			return (
				<div
					className="chat-work-commentary"
					key={`${keyPrefix}-${getRenderPartKey(part, index)}`}
				>
					<MarkdownPart text={part.text} />
				</div>
			);
		}
		if (part.type === "tool_call") {
			return (
				<ToolCallContentView
					key={`${keyPrefix}-${getRenderPartKey(part, index)}`}
					part={part}
					backend={backend}
				/>
			);
		}
		if (part.type === "command") {
			return (
				<ToolCallContentView
					key={`${keyPrefix}-${getRenderPartKey(part, index)}`}
					backend={backend}
					part={
						{
							type: "tool_call",
							id: part.id,
							name: "execute",
							title: part.command,
							arguments: part.cwd
								? JSON.stringify({ command: part.command, cwd: part.cwd })
								: undefined,
							status: part.status,
							output: part.output,
						} as ToolCallPart
					}
				/>
			);
		}
		if (part.type === "file_change") {
			return (
				<ToolCallContentView
					key={`${keyPrefix}-${getRenderPartKey(part, index)}`}
					backend={backend}
					part={
						{
							type: "tool_call",
							id: part.id,
							name: "edit",
							title: part.path,
							status: part.status ?? "completed",
							locations: [{ path: part.path }],
							parts: [part],
						} as ToolCallPart
					}
				/>
			);
		}
		return (
			<MessagePartView
				key={`${keyPrefix}-${getRenderPartKey(part, index)}`}
				part={part}
			/>
		);
	});
}

function shouldRenderWorkPart(
	part: AcpMessagePart,
	streaming: boolean,
): boolean {
	if (part.type !== "tool_call" || streaming) return true;
	const status = part.status?.toLowerCase();
	if (status !== "pending" && status !== "in_progress") return true;
	const hasContent =
		Boolean(part.output || part.arguments) ||
		(Array.isArray((part as { parts?: unknown }).parts) &&
			(part as unknown as { parts: unknown[] }).parts.length > 0) ||
		(Array.isArray((part as { locations?: unknown }).locations) &&
			(part as unknown as { locations: unknown[] }).locations.length > 0);
	return hasContent;
}
