import "./MessagePartView.scss";
import type { AcpMessagePart } from "@shellular/protocol";
import ChatDisclosure from "./ChatDisclosure";
import FileChangePartView from "./FileChangePartView";
import FileReferencePartView from "./FileReferencePartView";
import MarkdownPart from "./MarkdownPart";
import PlanPartView from "./PlanPartView";
import TerminalOutputView from "./TerminalOutputView";
import ToolCallContentView from "./ToolCallContentView";
import UserTextPart from "./UserTextPart";

export default function MessagePartView({
	part,
	role = "assistant",
}: {
	part: AcpMessagePart;
	role?: "user" | "assistant";
}) {
	switch (part.type) {
		case "text": {
			if (role === "user") {
				return <UserTextPart text={part.text} />;
			}
			return <MarkdownPart text={part.text} />;
		}
		case "tool_call": {
			return <ToolCallContentView part={part} />;
		}
		case "reasoning":
			return (
				<ChatDisclosure
					className="chat-part-card chat-part-card--reasoning"
					summary={
						<>
							<span className="icon-cpu" aria-hidden="true" />
							<span>{part.summary || "Reasoning"}</span>
						</>
					}
				>
					{/* Reasoning is prose, not code — typeset it as quiet body text. */}
					<div className="chat-part-prose">{part.content}</div>
				</ChatDisclosure>
			);
		case "plan":
			return <PlanPartView part={part} />;
		case "command":
			return (
				<ChatDisclosure
					className="chat-part-card chat-part-card--command"
					showChevron={false}
					summary={
						<>
							<span className="icon-terminal" aria-hidden="true" />
							<span>{part.command}</span>
							{part.status && <em>{part.status}</em>}
						</>
					}
				>
					{part.cwd && <div className="chat-part-muted">{part.cwd}</div>}
					{part.output && <TerminalOutputView output={part.output} />}
				</ChatDisclosure>
			);
		case "file_reference":
			return <FileReferencePartView part={part} />;
		case "file_change":
			return <FileChangePartView part={part} />;
		case "web_reference":
			return (
				<a href={part.url} target="_blank" rel="noreferrer">
					{part.title || part.url}
				</a>
			);
		case "image":
			return (
				<img
					className="chat-part-image"
					src={part.src}
					alt={part.alt || "Generated image"}
				/>
			);
		case "audio":
			return (
				<audio className="chat-part-audio" src={part.src} controls>
					Audio content
				</audio>
			);
		case "resource":
			return (
				<ChatDisclosure
					className="chat-part-resource"
					showChevron={false}
					summary={
						<>
							<span className="icon-file" aria-hidden="true" />
							<strong>{part.title || part.name || part.uri}</strong>
						</>
					}
				>
					{part.description && <em>{part.description}</em>}
					{part.text && <pre>{part.text}</pre>}
				</ChatDisclosure>
			);
		default:
			return null;
	}
}
