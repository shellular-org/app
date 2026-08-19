import "./style.scss";
import type { AcpMessagePart, AiBackend } from "@shellular/protocol";
import CopyButton from "./components/CopyButton";
import MessagePartView from "./components/MessagePartView";
import ToolCallGroupView from "./components/ToolCallGroupView";
import TurnHeader, { type TurnState } from "./components/TurnHeader";
import WorkLogView from "./components/WorkLogView";
import {
	getAnswerParts,
	isCopyableMessagePart,
	isFinishedToolCall,
	messagePartsToMarkdown,
	type ToolCallPart,
} from "./lib/messageParts";
import { getRenderPartKey } from "./lib/utils";
import { splitCommentary } from "./lib/workLogLayout";

interface ChatBubbleProps {
	parts: AcpMessagePart[];
	messageRole: "user" | "assistant";
	assistantName: string;
	messageKey: string;
	streaming?: boolean;
	/**
	 * Whether this bubble closes a visual group of consecutive same-role
	 * messages. Actions (copy) render only on group-closing bubbles so an
	 * answer split across several ACP messages shows them once.
	 */
	showActions?: boolean;
	/** Parts to copy — the whole group's, not just this bubble's. */
	copyParts?: AcpMessagePart[];
	/**
	 * What the turn is blocked on, if anything. The header states it; the
	 * running row states what the agent is doing it with.
	 */
	turnState?: TurnState;
	/** Turn-level work projected out of the terminal assistant answer. */
	workParts?: AcpMessagePart[];
	/**
	 * Which agent produced this turn. Row objects resolve per agent, because
	 * the argument key that names a call is the agent's own convention.
	 */
	backend?: AiBackend;
	workStartedAt?: number;
	workDurationMs?: number;
}

const TOOL_CALL_GROUP_THRESHOLD = 4;

export default function ChatBubble({
	parts,
	messageRole,
	assistantName,
	messageKey,
	streaming = false,
	showActions = true,
	copyParts,
	turnState,
	workParts = [],
	workStartedAt,
	workDurationMs,
	backend,
}: ChatBubbleProps) {
	// Just the answer: reasoning and tool calls are folded away on screen and
	// carry their own copy buttons, so including them here would bury the reply
	// the user actually asked for under pages of transcript.
	const answerParts = getAnswerParts(copyParts ?? parts);
	const canCopy =
		!streaming && showActions && answerParts.some(isCopyableMessagePart);
	// While the turn runs, its latest commentary answers "where is this going"
	// and belongs in the header rather than at the end of the rail.
	const { commentary, rest: railParts } = streaming
		? splitCommentary(workParts)
		: { commentary: undefined, rest: workParts };

	return (
		<div
			className={`chat-bubble chat-bubble--${messageRole}${streaming ? " chat-bubble--streaming" : ""}`}
		>
			<div className="chat-bubble-role">
				{messageRole === "user" ? "You" : assistantName}
			</div>
			{streaming ? (
				<TurnHeader
					assistantName={assistantName}
					state={turnState ?? "working"}
					startedAt={workStartedAt}
					commentary={commentary}
				/>
			) : null}
			{railParts.length > 0 ? (
				<WorkLogView
					parts={railParts}
					streaming={streaming}
					stateKey={`${messageKey}-work`}
					durationMs={workDurationMs}
					backend={backend}
				/>
			) : null}
			{parts.length > 0 ? (
				<div className="chat-bubble-content">
					<div className="chat-bubble-text chat-bubble-text--md">
						{renderMessageParts(parts, messageRole, messageKey)}
					</div>
				</div>
			) : null}
			{canCopy && (
				<div className="chat-bubble-actions">
					<CopyButton
						getText={() => messagePartsToMarkdown(answerParts)}
						label="Copy response"
						className="chat-bubble-copy"
					/>
				</div>
			)}
		</div>
	);
}

function renderMessageParts(
	parts: AcpMessagePart[],
	role: "user" | "assistant",
	messageKey: string,
) {
	const nodes: React.ReactNode[] = [];
	for (let index = 0; index < parts.length; ) {
		const part = parts[index];
		if (part.type !== "tool_call") {
			nodes.push(
				<MessagePartView
					key={getRenderPartKey(part, index)}
					part={part}
					role={role}
				/>,
			);
			index += 1;
			continue;
		}

		const toolParts: ToolCallPart[] = [];
		let end = index;
		while (end < parts.length && parts[end].type === "tool_call") {
			toolParts.push(parts[end] as ToolCallPart);
			end += 1;
		}

		nodes.push(...renderToolCallRun(toolParts, index, messageKey));
		index = end;
	}
	return nodes;
}

function renderToolCallRun(
	parts: ToolCallPart[],
	startIndex: number,
	messageKey: string,
) {
	const nodes: React.ReactNode[] = [];
	let finishedBatch: ToolCallPart[] = [];
	let runIndex = 0;

	const flushFinishedBatch = () => {
		if (finishedBatch.length >= TOOL_CALL_GROUP_THRESHOLD) {
			const batchStartIndex = startIndex + runIndex - finishedBatch.length;
			const groupKey = `${messageKey}-tool-group-${batchStartIndex}-${getRenderPartKey(finishedBatch[0], batchStartIndex)}`;
			nodes.push(
				<ToolCallGroupView
					key={groupKey}
					parts={finishedBatch}
					startIndex={batchStartIndex}
					stateKey={groupKey}
				/>,
			);
		} else {
			nodes.push(
				...finishedBatch.map((part, offset) => (
					<MessagePartView
						key={getRenderPartKey(
							part,
							startIndex + runIndex - finishedBatch.length + offset,
						)}
						part={part}
					/>
				)),
			);
		}
		finishedBatch = [];
	};

	for (const part of parts) {
		if (isFinishedToolCall(part)) {
			finishedBatch.push(part);
			runIndex += 1;
			continue;
		}
		flushFinishedBatch();
		nodes.push(
			<MessagePartView
				key={getRenderPartKey(part, startIndex + runIndex)}
				part={part}
			/>,
		);
		runIndex += 1;
	}

	flushFinishedBatch();
	return nodes;
}
