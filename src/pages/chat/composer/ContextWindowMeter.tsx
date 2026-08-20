import { useState } from "react";
import {
	type ContextWindowUsage,
	formatTokenCount,
	getContextWindowPercentage,
	getContextWindowState,
} from "./contextWindowUsage";

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A ring rather than a bar plus a figure: it is the shape Claude Code already
 * uses for the same number, so it reads as a gauge, and it costs one slot in a
 * row that has none to spare. The figure is not lost, it just does not spend
 * width until it is asked for.
 *
 * Asking for it opens a popover rather than adding a line, because a line under
 * the row grows the composer and pushes every control up from under the thumb
 * that just tapped one. A readout must not move what it was read from.
 */
export default function ContextWindowMeter({
	usedTokens,
	maxTokens,
	onClick,
}: ContextWindowUsage & { onClick?: () => void }) {
	const [showFigure, setShowFigure] = useState(false);
	const percentage = getContextWindowPercentage(usedTokens, maxTokens);
	if (percentage === null) return null;
	const clampedPercentage = Math.max(0, Math.min(100, percentage));
	const remainingTokens = Math.max(0, maxTokens - usedTokens);
	const rounded = Math.round(clampedPercentage);
	const state = getContextWindowState(clampedPercentage);
	// The arc is accent at rest and only changes tone when the number starts to
	// matter, so it reads as a gauge rather than as a permanent warning.
	const tone =
		state === "warning"
			? "text-warning"
			: state === "danger"
				? "text-error"
				: "text-accent";

	return (
		<div className="relative shrink-0">
			<button
				type="button"
				className={`haptic-trigger relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent p-0 transition-[background] duration-150 after:absolute after:-inset-0.5 after:content-[''] active:bg-surface-soft [-webkit-tap-highlight-color:transparent] ${tone}`}
				onClick={() => setShowFigure((value) => !value)}
				aria-expanded={showFigure}
				aria-label={`${rounded}% of the context window used`}
			>
				{/* Decorative: the button carries the accessible name, and the popover
				    duplicates it visually once tapped. */}
				<svg width="21" height="21" viewBox="0 0 20 20" aria-hidden="true">
					<title>Context window usage</title>
					<circle
						cx="10"
						cy="10"
						r={RADIUS}
						fill="none"
						strokeWidth="2.6"
						stroke="color-mix(in srgb, var(--primary-text) 9%, transparent)"
					/>
					<circle
						cx="10"
						cy="10"
						r={RADIUS}
						fill="none"
						strokeWidth="2.6"
						strokeLinecap="round"
						stroke="currentColor"
						strokeDasharray={CIRCUMFERENCE}
						strokeDashoffset={CIRCUMFERENCE * (1 - clampedPercentage / 100)}
						transform="rotate(-90 10 10)"
					/>
				</svg>
			</button>
			{showFigure && (
				<button
					type="button"
					className="haptic-trigger absolute bottom-[calc(100%+8px)] right-0 z-10 flex cursor-pointer items-baseline gap-1.5 whitespace-nowrap rounded-[10px] border border-(--card-border) bg-(--popup-background) px-3 py-2 text-[11px] font-medium shadow-[0_8px_24px_-8px_var(--shadow-color)] [-webkit-tap-highlight-color:transparent]"
					onClick={() => {
						setShowFigure(false);
						onClick?.();
					}}
				>
					<span className={`font-semibold ${tone}`}>{`${rounded}% used`}</span>
					<span className="text-secondary-text">
						{`${formatTokenCount(remainingTokens)} left`}
					</span>
					<span
						className="icon-chevron-right text-[9px] text-secondary-text opacity-60"
						aria-hidden="true"
					/>
				</button>
			)}
		</div>
	);
}
