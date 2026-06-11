import "./PlanPartView.scss";
import type { AcpMessagePart } from "@shellular/protocol";
import { formatPlanStatus } from "../lib/messageParts";
import { normalizeClassName } from "../lib/utils";

export default function PlanPartView({
	part,
}: {
	part: Extract<AcpMessagePart, { type: "plan" }>;
}) {
	const planPart = part as Extract<AcpMessagePart, { type: "plan" }> & {
		entries?: Array<{ content: string; status?: string }>;
	};
	const entries = Array.isArray(planPart.entries) ? planPart.entries : null;
	return (
		<details className="chat-part-card chat-part-card--plan">
			<summary className="chat-part-card-title">
				<span className="icon-check-square" aria-hidden="true" />
				<span>{part.summary || "Plan"}</span>
			</summary>
			{entries?.length ? (
				<ol className="chat-plan-list">
					{entries.map((entry) => (
						<li
							key={`${entry.status || "plan"}-${entry.content}`}
							className={`chat-plan-item chat-plan-item--${normalizeClassName(entry.status || "pending")}`}
						>
							<span className="chat-plan-status">
								{formatPlanStatus(entry.status)}
							</span>
							<span>{entry.content}</span>
						</li>
					))}
				</ol>
			) : (
				<pre>{part.content}</pre>
			)}
		</details>
	);
}
