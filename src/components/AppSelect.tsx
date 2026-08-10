import {
	Listbox,
	ListboxButton,
	ListboxOption,
	ListboxOptions,
} from "@headlessui/react";
import { type ReactNode, useMemo } from "react";
import "./AppSelect.scss";

export type AppSelectOption = {
	value: string;
	label: string;
};

type AppSelectProps = {
	value: string;
	options: AppSelectOption[];
	onChange: (value: string) => void;
	disabled?: boolean;
	ariaLabel?: string;
	className?: string;
	prefix?: ReactNode;
	size?: "default" | "compact";
	menuPlacement?: "auto" | "top" | "bottom";
};

export default function AppSelect({
	value,
	options,
	onChange,
	disabled = false,
	ariaLabel,
	className = "",
	prefix,
	size = "default",
	menuPlacement = "auto",
}: AppSelectProps) {
	const selected = options.find((option) => option.value === value);
	const anchor = useMemo(() => {
		const to = menuPlacement === "top" ? "top" : "bottom";
		return { to, gap: 8, padding: 10 } as const;
	}, [menuPlacement]);

	return (
		<Listbox
			value={value}
			onChange={onChange}
			disabled={disabled}
			as="div"
			className={`app-select app-select--${size} inline-flex min-w-0 ${className}`.trim()}
		>
			<ListboxButton
				className="app-select__button inline-flex min-w-0 items-center"
				aria-label={ariaLabel}
			>
				{prefix ? <span className="app-select__prefix">{prefix}</span> : null}
				<span className="app-select__value min-w-0 flex-1 truncate text-left">
					{selected?.label ?? value}
				</span>
				<span
					className="icon-chevron-down app-select__chevron"
					aria-hidden="true"
				/>
			</ListboxButton>
			<ListboxOptions
				anchor={anchor}
				portal
				className="app-select-menu z-10001 overflow-auto"
				aria-label={ariaLabel}
			>
				{options.map((option) => (
					<ListboxOption
						key={option.value}
						value={option.value}
						title={option.label}
						className={({ focus, selected }) =>
							`app-select-menu__item flex w-full items-center justify-between${
								focus || selected ? " app-select-menu__item--active" : ""
							}`
						}
					>
						<span>{option.label}</span>
						{option.value === value && (
							<span className="icon-check" aria-hidden="true" />
						)}
					</ListboxOption>
				))}
			</ListboxOptions>
		</Listbox>
	);
}
