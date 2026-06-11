import "./TerminalOutputView.scss";
import { stripAnsi } from "pages/chat/chat-bubble/lib/utils";

export default function TerminalOutputView({
	output,
	meta,
}: {
	output: string;
	meta?: string;
}) {
	return (
		<div className="chat-terminal-output">
			<div className="chat-terminal-output-title">
				<span className="icon-terminal"></span>
				<span>Terminal</span>
				{meta && <em>{meta}</em>}
			</div>
			<pre>{stripAnsi(output)}</pre>
		</div>
	);
}
