import "./TurnHeader.scss";
import { useEffect, useRef } from "react";

export type TurnState =
	| "working"
	| "waiting-permission"
	| "waiting-answer"
	| "failed";

interface Props {
	assistantName: string;
	state: TurnState;
	startedAt?: number;
	commentary?: string;
}

const STATE_ICON: Record<TurnState, string> = {
	working: "icon-tool",
	"waiting-permission": "icon-alert-triangle",
	"waiting-answer": "icon-message-circle",
	failed: "icon-alert-triangle",
};

/**
 * What the agent is doing, for how long, and where it is going. The running
 * row underneath states what it is doing it *with*; pasting that tool title
 * into a sentence here is what produced `Claude Code is cd "/home/jk/… &&
 * for f in *.md; do echo …`.
 */
export default function TurnHeader({
	assistantName,
	state,
	startedAt,
	commentary,
}: Props) {
	return (
		<section className={`turn-header turn-header--${state}`}>
			<div className="turn-header-state">
				<span
					className={`${STATE_ICON[state]} turn-header-icon`}
					aria-hidden="true"
				/>
				<span role="status">{stateLabel(assistantName, state)}</span>
				<WorkingTimer startedAt={startedAt} />
			</div>
			{commentary ? (
				<div className="turn-header-commentary">
					<span
						className="icon-message-circle turn-header-quote"
						aria-hidden="true"
					/>
					<span>{commentary}</span>
				</div>
			) : null}
		</section>
	);
}

function stateLabel(assistantName: string, state: TurnState): string {
	switch (state) {
		case "waiting-permission":
			return `${assistantName} is waiting for permission`;
		case "waiting-answer":
			return `${assistantName} is waiting for your answer`;
		case "failed":
			return "A command failed";
		default:
			return `${assistantName} is working`;
	}
}

/**
 * Isolated self-ticking label: the transcript does not re-render each second.
 *
 * `role="timer"` is deliberate. Its implicit `aria-live` is `off`, unlike its
 * siblings `status` and `log`, so the counter can be marked up semantically
 * without a screen reader reading it aloud every second.
 *
 * The reduced-motion branch is a WCAG SC 2.2.2 (Level A) requirement, not a
 * nicety: a per-second counter is auto-updating content presented in parallel
 * with other content, and the criterion has no five-second exception. Dropping
 * to a once-a-minute coarse label is the "control the frequency" branch.
 */
function WorkingTimer({ startedAt }: { startedAt?: number }) {
	const labelRef = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const reduced =
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
		const normalizedStart = normalizeTimestamp(startedAt) ?? Date.now();
		const update = () => {
			if (!labelRef.current) return;
			const seconds = Math.max(
				0,
				Math.floor((Date.now() - normalizedStart) / 1_000),
			);
			if (reduced) {
				const minutes = Math.floor(seconds / 60);
				labelRef.current.textContent =
					minutes < 1 ? "running" : `running, over ${minutes}m`;
				return;
			}
			labelRef.current.textContent =
				seconds < 60
					? `${seconds}s`
					: `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
		};
		update();
		const timer = window.setInterval(update, reduced ? 60_000 : 1_000);
		return () => window.clearInterval(timer);
	}, [startedAt]);

	return (
		<span
			className="turn-header-timer"
			role="timer"
			aria-live="off"
			ref={labelRef}
		/>
	);
}

function normalizeTimestamp(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value < 10_000_000_000 ? value * 1_000 : value;
}
