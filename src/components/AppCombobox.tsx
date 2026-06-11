import "./AppCombobox.scss";
import {
	Combobox,
	ComboboxButton,
	ComboboxInput,
	ComboboxOption,
	ComboboxOptions,
} from "@headlessui/react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import type { AppSelectOption } from "./AppSelect";

type AppComboboxProps = {
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

export default function AppCombobox({
	value,
	options,
	onChange,
	disabled = false,
	ariaLabel,
	className = "",
	size = "default",
	menuPlacement = "auto",
}: AppComboboxProps) {
	const [query, setQuery] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const selected = options.find((option) => option.value === value) ?? null;
	const displayLabel = selected?.label ?? value;
	const filteredOptions = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return options;
		return options.filter(
			(option) =>
				option.label.toLowerCase().includes(normalizedQuery) ||
				option.value.toLowerCase().includes(normalizedQuery),
		);
	}, [options, query]);
	const anchor = useMemo(() => {
		const to = menuPlacement === "top" ? "top" : "bottom";
		return { to, gap: 8, padding: 10 } as const;
	}, [menuPlacement]);

	const scrollIntoView = useCallback(() => {
		const activeElement = document.querySelector(
			".app-combobox-menu__item--active",
		);
		if (activeElement) {
			activeElement.scrollIntoView({
				block: "center",
			});
		}
	}, []);

	return (
		<Combobox
			value={selected}
			onChange={(option) => {
				if (option) {
					setIsFocused(false);
					onChange(option.value);
				}
			}}
			onClose={() => setQuery("")}
			onAnimationStart={scrollIntoView}
			disabled={disabled}
			as="div"
			className={`app-combobox app-combobox--${size} inline-flex min-w-0 ${className}`.trim()}
			by="value"
			immediate
		>
			<div className="app-combobox__control inline-flex min-w-0 items-center">
				<ComboboxInput
					ref={inputRef}
					className="app-combobox__input min-w-0 flex-1 truncate"
					aria-label={ariaLabel}
					displayValue={(option: AppSelectOption | null) =>
						isFocused ? "" : (option?.label ?? displayLabel)
					}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<ComboboxButton className="app-combobox__button" aria-label={ariaLabel}>
					<span
						className="icon-chevron-down app-combobox__chevron"
						aria-hidden="true"
					/>
				</ComboboxButton>
			</div>
			<ComboboxOptions
				anchor={anchor}
				portal
				className="app-combobox-menu z-10001 overflow-auto"
			>
				{filteredOptions.length ? (
					filteredOptions.map((option) => (
						<ComboboxOption
							key={option.value}
							value={option}
							title={option.label}
							className={({ focus, selected }) =>
								`app-combobox-menu__item flex w-full items-center justify-between${
									focus || selected ? " app-combobox-menu__item--active" : ""
								}`
							}
						>
							<span>{option.label}</span>
							{option.value === value && (
								<span className="icon-check" aria-hidden="true" />
							)}
						</ComboboxOption>
					))
				) : (
					<div className="app-combobox-menu__empty">No matches</div>
				)}
			</ComboboxOptions>
		</Combobox>
	);
}
