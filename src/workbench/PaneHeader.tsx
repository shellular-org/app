import { type MouseEventHandler, type ReactNode, useId } from "react";

export const PANE_HEADER_CLASS =
	"flex h-[34px] shrink-0 items-center gap-1 bg-[color-mix(in_srgb,var(--secondary)_94%,var(--primary))] px-1";
export const PANE_HEADER_ICON_CLASS =
	"grid size-6 shrink-0 place-items-center rounded text-secondary-text hover:bg-surface-soft hover:text-primary-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-40";
export const PANE_HEADER_GLYPH_CLASS =
	"grid size-[14px] place-items-center text-[14px] leading-none";
export const NESTED_PANE_HEADER_CLASS =
	"group sticky top-0 z-10 flex h-7 shrink-0 items-center justify-between bg-[color-mix(in_srgb,var(--secondary)_94%,var(--primary))] px-1";

export function PaneTitleButton({
	expanded,
	icon,
	label,
	meta,
	onClick,
}: {
	expanded: boolean;
	icon?: string;
	label: string;
	meta?: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="flex h-full min-w-0 flex-1 items-center gap-1 text-left text-xs font-semibold text-primary-text"
			onClick={onClick}
			aria-expanded={expanded}
		>
			<span
				className={`${expanded ? "icon-chevron-down" : "icon-chevron-right"} ${PANE_HEADER_GLYPH_CLASS} opacity-70`}
				aria-hidden="true"
			/>
			{icon && (
				<span
					className={`${icon} ${PANE_HEADER_GLYPH_CLASS} opacity-80`}
					aria-hidden="true"
				/>
			)}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{meta}
		</button>
	);
}

export function PaneIconButton({
	icon,
	label,
	active,
	onClick,
}: {
	icon: string;
	label: string;
	active?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={`${PANE_HEADER_ICON_CLASS} ${active ? "bg-popup-background text-accent shadow-sm" : ""}`}
			onClick={onClick}
			aria-pressed={active}
			aria-label={label}
			title={label}
		>
			<span
				className={`${icon} ${PANE_HEADER_GLYPH_CLASS}`}
				aria-hidden="true"
			/>
		</button>
	);
}

export function NestedPaneHeader({
	expanded,
	label,
	count,
	action,
	onToggle,
	onContextMenu,
}: {
	expanded: boolean;
	label: string;
	count: number;
	action?: ReactNode;
	onToggle: () => void;
	onContextMenu?: MouseEventHandler<HTMLElement>;
}) {
	return (
		<header className={NESTED_PANE_HEADER_CLASS} onContextMenu={onContextMenu}>
			<button
				type="button"
				className="flex h-full min-w-0 flex-1 items-center gap-1 px-1 text-left text-xs font-semibold text-primary-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
				onClick={onToggle}
				aria-expanded={expanded}
			>
				<span
					className={`${expanded ? "icon-chevron-down" : "icon-chevron-right"} ${PANE_HEADER_GLYPH_CLASS} opacity-70`}
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1 truncate">{label}</span>
			</button>
			<div className="flex h-full shrink-0 items-center gap-0.5">
				{action}
				<span
					className="min-w-5 px-1 text-right text-[11px] font-normal tabular-nums text-secondary-text"
					title={`${count} ${count === 1 ? "change" : "changes"}`}
				>
					{count}
				</span>
			</div>
		</header>
	);
}

export function PaneSegmentedControl<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: Array<{ value: T; icon: string; label: string }>;
	value: T;
	onChange: (value: T) => void;
}) {
	const groupName = useId();
	return (
		<div
			role="radiogroup"
			aria-label={label}
			className="flex shrink-0 items-center rounded-md border border-card-border bg-surface-soft p-px"
		>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<label
						key={option.value}
						title={option.label}
						className="cursor-pointer"
					>
						<input
							type="radio"
							name={groupName}
							value={option.value}
							checked={active}
							onChange={() => onChange(option.value)}
							aria-label={option.label}
							className="peer sr-only"
						/>
						<span
							className={`${option.icon} grid size-6 place-items-center rounded-[4px] text-[14px] leading-none peer-focus-visible:ring-1 peer-focus-visible:ring-inset peer-focus-visible:ring-accent ${active ? "bg-popup-background text-accent shadow-sm" : "text-secondary-text hover:bg-surface-strong hover:text-primary-text"}`}
							aria-hidden="true"
						/>
					</label>
				);
			})}
		</div>
	);
}
