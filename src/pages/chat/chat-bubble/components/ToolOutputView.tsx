import "./ToolOutputView.scss";
import { pushPage } from "App";
import { formatPartValue } from "../lib/messageParts";
import { stripAnsi } from "../lib/utils";
import FileReferencePartView from "./FileReferencePartView";
import ToolArguments from "./ToolArguments";

interface ToolOutput {
	path: string;
	output: string;
	truncated: boolean;
	preview?: string;
}

export default function ToolOutputView({
	title,
	output,
	toolArguments,
}: {
	title: string;
	output: string;
	toolArguments?: string;
}) {
	const parsed = parseToolOutput(output);

	let content = "";
	if (parsed) {
		content = stripAnsi(parsed.preview || parsed.output);
	} else {
		content = formatPartValue(output);
	}

	return (
		<div className="tool-output">
			<pre>{content}</pre>
			{parsed?.path && (
				<FileReferencePartView
					part={{
						path: parsed.path,
						type: "file_reference",
					}}
				/>
			)}
			{toolArguments && (
				<button
					type="button"
					className="tool-arguments-card"
					onClick={() => {
						pushPage(
							"tool-arguments",
							<ToolArguments args={toolArguments} title={title} />,
						);
					}}
				>
					<span className="icon-corner-down-right"></span>
					View arguments
					<em>
						<span className="icon-chevron-right" />
					</em>
				</button>
			)}
		</div>
	);
}

function parseToolOutput(output: string): ToolOutput | null {
	try {
		const parsed = JSON.parse(output);

		if (!parsed.output || !parsed.metadata) {
			throw new Error("Not valid tool output");
		}

		const match = Array.from(/<path>(.*)<\/path>/.exec(parsed.output) || []);
		let path = "";

		if (match.length > 1) {
			[, path] = match;
		}

		return {
			path,
			output: parsed.output,
			preview: parsed.metadata?.preview,
			truncated: Boolean(parsed.metadata?.truncated),
		};
	} catch {
		return null;
	}
}
