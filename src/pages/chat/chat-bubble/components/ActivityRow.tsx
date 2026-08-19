import "./ActivityRow.scss";
import type { ActivityKind, ActivityRowModel } from "../lib/activityRow";
import type { OutputSummary } from "../lib/outputSummary";
import ChatDisclosure from "./ChatDisclosure";
import Status from "./Status";

interface Props {
	row: ActivityRowModel;
	output?: OutputSummary | null;
	/** Pre-formatted `+84 −12`, from a file_change diff. */
	diffStat?: React.ReactNode;
	chips?: string[];
	extraChips?: number;
	stateKey?: string;
	/** When present the row expands; without it the row is static. */
	children?: React.ReactNode;
}

export default function ActivityRow({
	row,
	output,
	diffStat,
	chips,
	extraChips = 0,
	stateKey,
	children,
}: Props) {
	const className = `activity-row${row.failed ? " activity-row--failed" : ""}${
		row.running ? " activity-row--running" : ""
	}`;
	// A failure's output is the reason to look at it, so the row starts open —
	// and then the peek would only repeat what is expanded right underneath it.
	const startsOpen = Boolean(children) && row.failed;

	const summary = (
		<>
			<span
				className={`${activityIcon(row.kind)} activity-row-icon`}
				aria-hidden="true"
			/>
			<span className="activity-row-label">
				{row.verb ? <strong>{row.verb}</strong> : null}
				{row.object ? (
					<span
						className={
							row.objectIsMono
								? "activity-row-object activity-row-object--mono"
								: "activity-row-object"
						}
					>
						{isElided(row.object, row.objectFull) ? (
							<>
								{/* The value was shortened in JS, so the full string has left
								    the DOM and a screen reader would otherwise hear the short
								    form too. `aria-label` is not an option here: a bare span
								    has no role that supports a name, so the full text is
								    rendered and hidden visually instead. A wrapped
								    description needs neither: its text is all still there,
								    only clamped by CSS. */}
								<span aria-hidden="true">{row.object}</span>
								<span className="activity-row-object-full">
									{row.objectFull}
								</span>
							</>
						) : (
							row.object
						)}
					</span>
				) : null}
			</span>
			<span className="activity-row-status">
				<Status
					status={
						row.running ? "in_progress" : row.failed ? "failed" : "completed"
					}
				/>
			</span>
		</>
	);

	// The result sits beside the row, never inside the disclosure panel: an
	// outcome the reader has to tap for is an outcome they will not see.
	const body = (
		<>
			{diffStat ? <div className="activity-row-detail">{diffStat}</div> : null}
			{!startsOpen && output?.mode === "inline"
				? output.lines.map((line, index) => (
						<div
							className="activity-row-detail activity-row-detail--mono"
							// biome-ignore lint/suspicious/noArrayIndexKey: the summary is recomputed wholesale from one output string, so a line's position is its identity and nothing ever reorders
							key={`${index}-${line}`}
						>
							{line}
						</div>
					))
				: null}
			{!startsOpen && output?.mode === "peek" ? (
				<>
					<pre
						className={`activity-row-peek${
							row.failed ? " activity-row-peek--failed" : ""
						}${output.clipped === "top" ? " activity-row-peek--clipped-top" : ""}`}
					>
						{output.lines.join("\n")}
					</pre>
					<div className="activity-row-more">{`${output.lineCount} lines`}</div>
				</>
			) : null}
			{/* Chips are display-only. Making them tappable would add a third
			    disclosure level (Nielsen caps it at two) and create a sub-target
			    below the 24 CSS px of WCAG SC 2.5.8. */}
			{chips?.length ? (
				<div className="activity-row-chips">
					{chips.map((chip, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: chips come from one folded run and are positional; two files can share a basename, so the value alone is not a key
							key={`${index}-${chip}`}
							className="activity-row-chip"
						>
							{chip}
						</span>
					))}
					{extraChips > 0 ? (
						<span className="activity-row-chip activity-row-chip--more">{`+${extraChips}`}</span>
					) : null}
				</div>
			) : null}
		</>
	);

	if (!children) {
		return (
			<div className={className}>
				<div className="chat-part-card-title">{summary}</div>
				{body}
			</div>
		);
	}

	// A failure's output is the reason to look at it, so it starts open.
	return (
		<div className={className}>
			<ChatDisclosure
				card={false}
				stateKey={stateKey}
				defaultOpen={startsOpen}
				summary={summary}
			>
				{children}
			</ChatDisclosure>
			{body}
		</div>
	);
}

/** Whether the visible object lost characters the reader would still need. */
function isElided(object: string, full: string | undefined): boolean {
	return Boolean(full) && full !== object;
}

function activityIcon(kind: ActivityKind) {
	switch (kind) {
		case "execute":
			return "icon-terminal";
		case "read":
			return "icon-eye";
		case "change":
			return "icon-edit";
		case "search":
			return "icon-search";
		case "fetch":
			return "icon-globe";
		case "think":
			return "icon-cpu";
		case "switch_mode":
			return "icon-settings";
		default:
			return "icon-tool";
	}
}
