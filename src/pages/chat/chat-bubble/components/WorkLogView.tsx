import "./WorkLogView.scss";
import type { AcpMessagePart } from "@shellular/protocol";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { messagePartsToMarkdown, type ToolCallPart } from "../lib/messageParts";
import { getRenderPartKey } from "../lib/utils";
import {
	formatWorkDuration,
	groupWorkLogParts,
	type WorkLogGroup,
} from "../lib/workLog";
import ChatDisclosure from "./ChatDisclosure";
import MarkdownPart from "./MarkdownPart";
import MessagePartView from "./MessagePartView";
import ToolCallContentView from "./ToolCallContentView";

interface WorkLogViewProps {
	parts: AcpMessagePart[];
	streaming: boolean;
	stateKey: string;
	startedAt?: number;
	durationMs?: number;
}

const WorkLogView = memo(function WorkLogView({
	parts,
	streaming,
	stateKey,
	startedAt,
	durationMs,
}: WorkLogViewProps) {
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
				<WorkLogGroups groups={groups} keyPrefix={`${stateKey}-live`} />
				<WorkingTimer startedAt={startedAt} />
			</section>
		);
	}

	const durationLabel =
		durationMs === undefined
			? "Worked"
			: `Worked for ${formatWorkDuration(durationMs)}`;
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
				</>
			}
		>
			<div className="chat-work-log-list">
				<WorkLogGroups groups={groups} keyPrefix={`${stateKey}-settled`} />
			</div>
		</ChatDisclosure>
	);
});

export default WorkLogView;

function WorkLogGroups({
	groups,
	keyPrefix,
}: {
	groups: WorkLogGroup[];
	keyPrefix: string;
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
				/>
			);
		}
		return (
			<WorkPartList key={groupKey} parts={[group.part]} keyPrefix={groupKey} />
		);
	});
}

function WorkActionGroup({
	parts,
	stateKey,
}: {
	parts: AcpMessagePart[];
	stateKey: string;
}) {
	const [showPrevious, setShowPrevious] = useState(false);
	const previousCount = Math.max(0, parts.length - 1);
	const latestPart = parts[parts.length - 1];
	const previousParts = showPrevious ? parts.slice(0, -1).reverse() : [];
	if (!latestPart) return null;

	return (
		<div className="chat-work-action-group">
			<WorkPartList parts={[latestPart]} keyPrefix={`${stateKey}-latest`} />
			{previousParts.length > 0 ? (
				<WorkPartList
					parts={previousParts}
					keyPrefix={`${stateKey}-previous`}
				/>
			) : null}
			{previousCount > 0 ? (
				<button
					type="button"
					className="chat-work-log-previous"
					aria-expanded={showPrevious}
					onClick={() => setShowPrevious((value) => !value)}
				>
					<span
						className={`icon-chevron-${showPrevious ? "up" : "down"}`}
						aria-hidden="true"
					/>
					<span>
						{showPrevious
							? "Show fewer tool calls"
							: `+${previousCount} previous tool ${previousCount === 1 ? "call" : "calls"}`}
					</span>
				</button>
			) : null}
		</div>
	);
}

function WorkPartList({
	parts,
	keyPrefix,
}: {
	parts: AcpMessagePart[];
	keyPrefix: string;
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
				/>
			);
		}
		if (part.type === "command") {
			return (
				<ToolCallContentView
					key={`${keyPrefix}-${getRenderPartKey(part, index)}`}
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

/** Isolated self-ticking label: the transcript does not re-render each second. */
function WorkingTimer({ startedAt }: { startedAt?: number }) {
	const labelRef = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const normalizedStart = normalizeTimestamp(startedAt) ?? Date.now();
		const update = () => {
			if (!labelRef.current) return;
			const seconds = Math.max(
				0,
				Math.floor((Date.now() - normalizedStart) / 1_000),
			);
			labelRef.current.textContent = `Working for ${seconds}s`;
		};
		update();
		const timer = window.setInterval(update, 1_000);
		return () => window.clearInterval(timer);
	}, [startedAt]);

	return (
		<div className="chat-work-timer" aria-live="off">
			<span className="chat-work-timer-dots" aria-hidden="true">
				<i />
				<i />
				<i />
			</span>
			<span ref={labelRef}>Working</span>
		</div>
	);
}

function normalizeTimestamp(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value < 10_000_000_000 ? value * 1_000 : value;
}
