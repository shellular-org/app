import type React from "react";
import {
	type ContextWindowUsage,
	formatTokenCount,
	getContextWindowPercentage,
	getContextWindowState,
} from "./contextWindowUsage";

export default function ContextWindowMeter({
	usedTokens,
	maxTokens,
	onClick,
}: ContextWindowUsage & { onClick?: () => void }) {
	const percentage = getContextWindowPercentage(usedTokens, maxTokens);
	if (percentage === null) return null;
	const clampedPercentage = Math.max(0, Math.min(100, percentage));
	const remainingTokens = Math.max(0, maxTokens - usedTokens);
	const title = `${Math.round(percentage)}% used, ${formatTokenCount(remainingTokens)} left`;
	const state = getContextWindowState(clampedPercentage);
	return (
		<button
			type="button"
			className={`haptic-trigger inline-flex h-[34px] w-[34px] min-w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent p-0 text-secondary-text transition-[background] duration-150 active:bg-surface-soft [-webkit-tap-highlight-color:transparent] ${state === "warning" ? "text-warning" : state === "danger" ? "text-error" : ""}`}
			onClick={onClick}
			title={`Context window: ${formatTokenCount(usedTokens)} / ${formatTokenCount(maxTokens)} tokens (${title})`}
			aria-label={`Context window ${title}`}
		>
			<span
				className="h-[18px] w-[18px] rounded-full shadow-[0_0_0_1px_var(--line-soft)_inset] [background:radial-gradient(circle_at_center,var(--secondary)_58%,transparent_60%),conic-gradient(currentColor_var(--context-used,0%),var(--surface-soft)_0)]"
				style={
					{
						"--context-used": `${clampedPercentage}%`,
					} as React.CSSProperties
				}
				aria-hidden="true"
			/>
		</button>
	);
}
