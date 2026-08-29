import type { RefObject } from "react";

interface PageSearchToolbarProps {
	value: string;
	onChange: (value: string) => void;
	onDismiss: () => void;
	placeholder: string;
	ariaLabel: string;
	inputRef?: RefObject<HTMLInputElement | null>;
	closing?: boolean;
}

export default function PageSearchToolbar({
	value,
	onChange,
	onDismiss,
	placeholder,
	ariaLabel,
	inputRef,
	closing = false,
}: PageSearchToolbarProps) {
	return (
		<search
			className="page-search-toolbar flex w-full items-center"
			data-state={closing ? "closing" : "open"}
		>
			<div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-line-soft bg-surface-soft px-2.5 text-secondary-text focus-within:border-accent/60 focus-within:bg-primary">
				<span className="icon-search shrink-0 text-sm" aria-hidden="true" />
				<input
					ref={inputRef}
					type="search"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Escape") return;
						event.preventDefault();
						onDismiss();
					}}
					placeholder={placeholder}
					aria-label={ariaLabel}
					className="min-w-0 flex-1 appearance-none border-0 bg-transparent text-[13px] text-primary-text outline-none placeholder:text-secondary-text/60 [&::-webkit-search-cancel-button]:appearance-none"
				/>
				{value ? (
					<button
						type="button"
						className="grid size-6 shrink-0 place-items-center rounded text-secondary-text hover:bg-primary hover:text-primary-text"
						onClick={() => onChange("")}
						aria-label="Clear search"
					>
						<span className="icon-x text-xs" aria-hidden="true" />
					</button>
				) : null}
			</div>
		</search>
	);
}
