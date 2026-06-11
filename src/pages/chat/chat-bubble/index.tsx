import "./style.scss";
import type { AcpMessagePart } from "@shellular/protocol";
import Mascot from "components/Mascot";
import { useEffect, useRef, useState } from "react";
import MessagePartView from "./components/MessagePartView";
import ToolCallGroupView from "./components/ToolCallGroupView";
import {
	isCopyableMessagePart,
	isFinishedToolCall,
	messagePartsToMarkdown,
	type ToolCallPart,
} from "./lib/messageParts";
import { copyTextToClipboard, getRenderPartKey } from "./lib/utils";

interface ChatBubbleProps {
	parts: AcpMessagePart[];
	messageRole: "user" | "assistant";
	assistantName: string;
	messageKey: string;
	streaming?: boolean;
}

const TOOL_CALL_GROUP_THRESHOLD = 4;

export default function ChatBubble({
	parts,
	messageRole,
	assistantName,
	messageKey,
	streaming = false,
}: ChatBubbleProps) {
	const copiedTimeoutRef = useRef<number | null>(null);
	const [copied, setCopied] = useState(false);
	const canCopy = !streaming && parts.some(isCopyableMessagePart);

	useEffect(() => {
		return () => {
			if (copiedTimeoutRef.current !== null) {
				window.clearTimeout(copiedTimeoutRef.current);
			}
		};
	}, []);

	const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const text = messagePartsToMarkdown(parts).trim();
		if (!text) return;

		await copyTextToClipboard(text);
		setCopied(true);
		if (copiedTimeoutRef.current !== null) {
			window.clearTimeout(copiedTimeoutRef.current);
		}
		copiedTimeoutRef.current = window.setTimeout(() => {
			setCopied(false);
			copiedTimeoutRef.current = null;
		}, 1400);
	};

	return (
		<div
			className={`chat-bubble chat-bubble--${messageRole}${streaming ? " chat-bubble--streaming" : ""}`}
		>
			<div className="chat-bubble-role">
				{messageRole === "user" ? "You" : assistantName}
			</div>
			<div className="chat-bubble-content">
				<div className="chat-bubble-text chat-bubble-text--md">
					{renderMessageParts(parts, messageRole, messageKey)}
				</div>
			</div>
			{canCopy && (
				<div className="chat-bubble-actions">
					<button
						type="button"
						className={`chat-bubble-copy${copied ? " chat-bubble-copy--copied" : ""}`}
						onClick={handleCopy}
						aria-label={copied ? "Copied" : "Copy message"}
						title={copied ? "Copied" : "Copy message"}
					>
						<span
							className={copied ? "icon-check" : "icon-copy"}
							aria-hidden="true"
						/>
					</button>
				</div>
			)}
			{streaming && (
				<div className="chat-typing">
					<Mascot state="thinking" size={34} tone="inline" />
					<span>{assistantName} is thinking...</span>
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
