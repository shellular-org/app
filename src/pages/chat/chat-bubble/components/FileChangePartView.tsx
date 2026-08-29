import "./FileChangePartView.scss";
import { pushPage } from "App";
import type { AcpMessagePart } from "@shellular/protocol";
import Page from "components/Page";
import { lazy, Suspense } from "react";
import { openWorkbenchSurface } from "workbench/store";
import { createEditorSurface } from "workbench/surfaces";
import { useChatDiffContext } from "../ChatDiffContext";

const MobileAgentDiffView = process.env.IS_DESKTOP_UI
	? null
	: lazy(() => import("./AgentDiffView"));

export default function FileChangePartView({
	part,
}: {
	part: Extract<AcpMessagePart, { type: "file_change" }>;
}) {
	const { messageKey, workspacePath } = useChatDiffContext();
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
								if (process.env.IS_DESKTOP_UI) {
									const sourceId = `${messageKey}:${part.id ?? part.path}`;
									openWorkbenchSurface(
										createEditorSurface({
											filePath: part.path,
											restorable: false,
											comparison: {
												kind: "inline",
												workspacePath,
												relativePath: part.path,
												sourceId,
												oldText: diff.old,
												newText: diff.new,
											},
										}),
									);
									return;
								}
								pushPage(
									"diff-view",
									<Page
										title={title}
										subtitle={part.kind}
										className="chat-diff-viewer"
									>
										<Suspense fallback={null}>
											{MobileAgentDiffView && (
												<MobileAgentDiffView
													path={part.path}
													oldText={diff.old}
													newText={diff.new}
												/>
											)}
										</Suspense>
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
