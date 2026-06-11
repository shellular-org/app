import "./AgentDiffView.scss";
import DiffView from "components/DiffView";

/**
 * Agent-chat wrapper around the shared {@link DiffView}, adding the chat
 * bubble's surface chrome. Use this only inside the agent chat UI; for other
 * diff surfaces use DiffView directly.
 */
export default function AgentDiffView({
	path,
	oldText,
	newText,
}: {
	path: string;
	oldText: string;
	newText: string;
}) {
	return (
		<div className="chat-agent-diff" data-path={path}>
			<DiffView
				className="chat-agent-diff-view"
				path={path}
				oldText={oldText}
				newText={newText}
			/>
		</div>
	);
}
