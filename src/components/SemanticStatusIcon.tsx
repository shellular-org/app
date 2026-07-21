import clsx from "clsx";

export type SemanticStatusTone =
	| "success"
	| "warning"
	| "danger"
	| "info"
	| "muted";

const TONE_CLASS: Record<SemanticStatusTone, string> = {
	success: "text-success",
	warning: "text-warning",
	danger: "text-danger",
	info: "text-info",
	muted: "text-secondary-text opacity-70",
};

export default function SemanticStatusIcon({
	icon,
	label,
	tone,
	animated = false,
	className,
}: {
	icon: string;
	label: string;
	tone: SemanticStatusTone;
	animated?: boolean;
	className?: string;
}) {
	return (
		<span
			className={clsx(
				"grid size-4 shrink-0 place-items-center",
				TONE_CLASS[tone],
				className,
			)}
			role="img"
			aria-label={label}
			title={label}
		>
			<span
				className={clsx(
					icon,
					"text-[14px] leading-none",
					animated && "animate-spin motion-reduce:animate-none",
				)}
				aria-hidden="true"
			/>
		</span>
	);
}
