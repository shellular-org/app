import type { AiBackend } from "@shellular/protocol";
import { deriveActivityRow } from "../lib/activityRow";
import {
	formatPartValue,
	getToolCallContentParts,
	type ToolCallPart,
} from "../lib/messageParts";
import { summarizeToolOutput } from "../lib/outputSummary";
import { getRenderPartKey } from "../lib/utils";
import ActivityRow from "./ActivityRow";
import MessagePartView from "./MessagePartView";
import ToolOutputView from "./ToolOutputView";

/**
 * A thin adapter: derive the row, summarise the output, hand both to
 * `ActivityRow`. Every decision about what the row says lives in `lib/`, so
 * this component only decides whether to render.
 */
export default function ToolCallContentView({
	part,
	backend,
}: {
	part: ToolCallPart;
	backend?: AiBackend;
}) {
	const row = deriveActivityRow(part, backend);
	const parts = getToolCallContentParts(part);
	const output = summarizeToolOutput(part.output, {
		failed: row.failed,
		running: row.running,
	});
	const hasDetails = Boolean(part.output || part.arguments || parts.length);

	if (!hasDetails) {
		return <ActivityRow row={row} output={output} />;
	}

	const contentParts = part.output
		? parts.filter(({ type }) => type === "file_change")
		: parts;

	return (
		<ActivityRow row={row} output={output} stateKey={part.id}>
			{part.output ? (
				<ToolOutputView
					title={part.title || row.verb || "Output"}
					output={part.output}
					toolArguments={part.arguments}
				/>
			) : null}
			{!part.output && part.arguments ? (
				<pre className="chat-work-row-arguments">
					{formatPartValue(part.arguments)}
				</pre>
			) : null}
			{contentParts.map((contentPart, index) => (
				<MessagePartView
					key={getRenderPartKey(contentPart, index)}
					part={contentPart}
				/>
			))}
		</ActivityRow>
	);
}
