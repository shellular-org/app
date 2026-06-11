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
	return (
		<button
			type="button"
			className={`chat-context-meter chat-context-meter--${getContextWindowState(clampedPercentage)}`}
			onClick={onClick}
			title={`Context window: ${formatTokenCount(usedTokens)} / ${formatTokenCount(maxTokens)} tokens (${title})`}
			aria-label={`Context window ${title}`}
		>
			<span
				className="chat-context-meter__ring"
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
