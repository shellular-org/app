import "./ToolCallGroupView.scss";
import { summarizeToolStatuses, type ToolCallPart } from "../lib/messageParts";
import { getRenderPartKey } from "../lib/utils";
import ChatDisclosure from "./ChatDisclosure";
import MessagePartView from "./MessagePartView";
import Status from "./Status";

export default function ToolCallGroupView({
	parts,
	startIndex,
	stateKey,
}: {
	parts: ToolCallPart[];
	startIndex: number;
	stateKey: string;
}) {
	const status = summarizeToolStatuses(parts);
	return (
		<ChatDisclosure
			className="chat-tool chat-tool-call-group"
			card={false}
			stateKey={stateKey}
			summary={(open) => (
				<>
					<span className="icon-tool" aria-hidden="true" />
					<span>{open ? "Hide tools" : "Show tools"}</span>
					<Status status={status} />
				</>
			)}
		>
			<div className="chat-tool-call-group-list">
				{parts.map((part, index) => (
					<MessagePartView
						key={getRenderPartKey(part, startIndex + index)}
						part={part}
					/>
				))}
			</div>
		</ChatDisclosure>
	);
}
