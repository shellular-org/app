import "./FileChangePartView.scss";
import { pushPage } from "App";
import type { AcpMessagePart } from "@shellular/protocol";
import Page from "components/Page";
import AgentDiffView from "./AgentDiffView";

export default function FileChangePartView({
	part,
}: {
	part: Extract<AcpMessagePart, { type: "file_change" }>;
}) {
	return (
		<div className="chat-part-card" data-open="false">
			{(() => {
				const diff = "diff" in part ? part.diff : undefined;
				if (diff) {
					const title = part.path.split("/").pop() || "File edit";
					return (
						<button
							type="button"
							className="chat-part-card-title"
							onClick={() => {
								pushPage(
									"diff-view",
									<Page
										title={title}
										subtitle={part.kind}
										className="chat-diff-viewer"
									>
										<AgentDiffView
											path={part.path}
											oldText={diff.old}
											newText={diff.new}
										/>
									</Page>,
								);
							}}
						>
							<span className="icon-edit" aria-hidden="true" />
							<span>{title}</span>
							<em>
								<span className="icon-chevron-right" />
							</em>
						</button>
					);
				}
				return (
					<span
						className="file-change"
						data-path={part.path}
						data-kind={part.kind}
					>
						<span className="icon-edit" />
						<span className="file-change-kind">{part.kind}</span>
						<span className="file-change-status">
							{part.path.split("/").pop()}
						</span>
					</span>
				);
			})()}
		</div>
	);
}
