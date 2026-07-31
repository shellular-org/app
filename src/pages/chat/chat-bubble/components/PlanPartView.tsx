import "./PlanPartView.scss";
import type { AcpMessagePart } from "@shellular/protocol";

import { readPlanEntries } from "../lib/messageParts";

/** ACP plan statuses. Anything unrecognized is treated as `pending`. */
const STATUS_PENDING = "pending";
const STATUS_IN_PROGRESS = "in_progress";
const STATUS_COMPLETED = "completed";

function normalizeStatus(status: string | undefined): string {
	switch (status) {
		case STATUS_IN_PROGRESS:
		case STATUS_COMPLETED:
			return status;
		default:
			return STATUS_PENDING;
	}
}

/**
 * Renders an ACP plan (`session/update` → `sessionUpdate: "plan"`).
 *
 * A plan is progress state, not a log entry, so the collapsed header alone has
 * to answer "how far along is it, and what is happening right now" — that is
 * all most users ever read, especially on a phone. The entry list is the
 * detail view behind it.
 *
 * Per spec each update is a COMPLETE replacement of the plan, so entries are
 * positional and the rendered list is always the whole current plan.
 */
export default function PlanPartView({
	part,
}: {
	part: Extract<AcpMessagePart, { type: "plan" }>;
}) {
	const entries = readPlanEntries(part);

	// Fallback for agents that send a plan without structured entries (and for
	// transcripts cached before entries were carried over the wire).
	if (entries.length === 0) {
		return (
			<details className="chat-part-card chat-part-card--plan">
				<summary className="chat-part-card-title">
					<span className="icon-check-square" aria-hidden="true" />
					<span>{part.summary || "Plan"}</span>
				</summary>
				<div className="chat-part-prose chat-plan-fallback">{part.content}</div>
			</details>
		);
	}

	const statuses = entries.map((entry) => normalizeStatus(entry.status));
	const done = statuses.filter((status) => status === STATUS_COMPLETED).length;
	const total = entries.length;
	const activeIndex = statuses.indexOf(STATUS_IN_PROGRESS);
	const complete = done === total;

	// Open while there is still work to watch; collapse once finished so long
	// transcripts don't carry a wall of ticked-off checklists. `open` is only
	// the initial state — the user can always toggle it.
	const live = !complete;

	// The collapsed header shows the task actually running. Once every entry is
	// done there is no current task, so the count carries the summary instead.
	const currentTask = activeIndex >= 0 ? entries[activeIndex].content : null;

	return (
		<details
			className={`chat-part-card chat-part-card--plan${complete ? " chat-part-card--plan-complete" : ""}`}
			open={live}
		>
			<summary className="chat-part-card-title chat-plan-summary">
				<span
					className={complete ? "icon-check-circle" : "icon-check-square"}
					aria-hidden="true"
				/>
				<span className="chat-plan-heading">
					<span className="chat-plan-heading-row">
						<span className="chat-plan-title">{part.summary || "Plan"}</span>
						<em className="chat-plan-count">
							{done}/{total}
						</em>
					</span>
					{currentTask ? (
						<span className="chat-plan-current">{currentTask}</span>
					) : null}
				</span>
			</summary>

			<div
				className="chat-plan-progress"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={total}
				aria-valuenow={done}
				aria-label={`${done} of ${total} tasks complete`}
			>
				<span
					className="chat-plan-progress-fill"
					style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
				/>
			</div>

			<ol className="chat-plan-list">
				{entries.map((entry, index) => {
					const status = statuses[index];
					return (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: plans are replaced wholesale and entries are positional, so the index is the stable identity here
							key={`${entry.status || "n/a"}-${index}`}
							className={`chat-plan-item chat-plan-item--${status}`}
							aria-current={status === STATUS_IN_PROGRESS ? "step" : undefined}
						>
							<span className="chat-plan-marker" aria-hidden="true">
								{status === STATUS_COMPLETED ? (
									<span className="icon-check" />
								) : status === STATUS_IN_PROGRESS ? (
									<span className="chat-plan-spinner" />
								) : (
									<span className="chat-plan-dot" />
								)}
							</span>
							<span className="chat-plan-content">{entry.content}</span>
						</li>
					);
				})}
			</ol>
		</details>
	);
}
