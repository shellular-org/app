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
		<div className="box-border min-w-0 max-w-full overflow-hidden">
			<pre className="m-0 max-h-[260px] max-w-full overflow-x-hidden overflow-y-auto bg-transparent px-2.5 pb-[11px] pt-[9px] font-['JetBrainsMono_Nerd_Font',ui-monospace,Menlo,monospace] text-[11px] leading-[1.5] text-[#d7dae0] [box-sizing:border-box] [overflow-wrap:anywhere] [white-space:pre-wrap] [word-break:break-word]">
				{content}
			</pre>
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
					className="group mx-2.5 mb-2 mt-[-3px] inline-flex min-h-[22px] w-max max-w-[calc(100%-20px)] cursor-pointer items-center gap-[5px] rounded border-0 bg-transparent px-1 py-0.5 text-[10px] font-medium text-secondary-text opacity-50 transition-[background,color] duration-150 [-webkit-tap-highlight-color:transparent] hover:bg-transparent hover:text-primary-text hover:opacity-[0.82]"
					onClick={() => {
						pushPage(
							"tool-arguments",
							<ToolArguments args={toolArguments} title={title} />,
						);
					}}
				>
					<span className="shrink-0 text-[11px] opacity-70" aria-hidden="true">
						<span className="icon-corner-down-right" />
					</span>
					View arguments
					<em className="ml-auto inline-flex items-center text-current not-italic opacity-45">
						<span className="text-[9px] icon-chevron-right" />
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
