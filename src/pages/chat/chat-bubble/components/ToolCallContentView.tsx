import {
	getToolCallContentParts,
	type ToolCallPart,
} from "../lib/messageParts";
import { getRenderPartKey } from "../lib/utils";
import ChatDisclosure from "./ChatDisclosure";
import MessagePartView from "./MessagePartView";
import NameIcon from "./NameIcon";
import Status from "./Status";
import ToolOutputView from "./ToolOutputView";

export default function ToolCallContentView({ part }: { part: ToolCallPart }) {
	let parts = getToolCallContentParts(part);

	if (parts.find(({ type }) => type === "file_change")) {
		parts = parts.filter(({ type }) => type === "file_change");

		return (
			<>
				{parts.map((contentPart, index) => (
					<MessagePartView
						key={getRenderPartKey(contentPart, index)}
						part={contentPart}
					/>
				))}
			</>
		);
	}

	if (part.output) {
		return (
			<ChatDisclosure
				summary={
					<>
						<NameIcon name={part.name} />
						<span>{part.title}</span>
						<Status status={part.status} />
					</>
				}
			>
				<ToolOutputView
					title={part.title || "Tool Call"}
					output={part.output}
					toolArguments={part.arguments}
				/>
			</ChatDisclosure>
		);
	}

	if (parts.every(({ type }) => type === "text")) {
		return (
			<ChatDisclosure
				summary={
					<>
						<span className="icon-tool" />
						<span>{part.title}</span>
					</>
				}
				className="chat-part-card"
			>
				<div style={{ padding: "10px", background: "var(--surface-soft)" }}>
					{parts.map((contentPart, index) => (
						<MessagePartView
							key={getRenderPartKey(contentPart, index)}
							part={contentPart}
						/>
					))}
				</div>
			</ChatDisclosure>
		);
	}

	return (
		<>
			{parts.map((contentPart, index) => (
				<MessagePartView
					key={getRenderPartKey(contentPart, index)}
					part={contentPart}
				/>
			))}
		</>
	);
}
