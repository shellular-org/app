import "./AppMenu.scss";
import {
	Menu,
	MenuButton,
	MenuItem,
	MenuItems,
	MenuSeparator,
} from "@headlessui/react";
import type { ReactNode } from "react";
import { useRef } from "react";

export interface AppMenuItem {
	key?: string;
	icon: string;
	label: string;
	danger?: boolean;
	subText?: string;
	divider?: boolean;
	onClick: () => void;
	comingSoon?: boolean;
	disabled?: boolean;
}

interface Props {
	items: AppMenuItem[];
	children?: ReactNode;
	ariaLabel: string;
	disabled?: boolean;
	buttonClassName?: string;
	onToggle?: (open: boolean) => void;
	placement?: "bottom end" | "bottom start" | "top end" | "top start";
}

export default function AppMenu({
	items,
	children,
	disabled,
	ariaLabel,
	onToggle,
	buttonClassName = "",
	placement = "bottom end",
}: Props) {
	const onToggleRef = useRef(onToggle);
	onToggleRef.current = onToggle;
	const prevOpenRef = useRef<boolean | undefined>(undefined);

	return (
		<Menu as="div" className="app-menu">
			{({ open }) => {
				if (prevOpenRef.current !== open) {
					prevOpenRef.current = open;
					onToggleRef.current?.(open);
				}
				return (
					<>
						<MenuButton
							type="button"
							className={buttonClassName}
							aria-label={ariaLabel}
							disabled={disabled}
						>
							{children ?? (
								<span
									className={`icon-more-vertical w-8 h-full flex items-center justify-end ${disabled ? "opacity-50" : ""}`}
									aria-hidden={true}
								/>
							)}
						</MenuButton>
						<MenuItems
							anchor={{ to: placement, gap: 8, padding: 8 }}
							portal
							modal={false}
							transition
							className="app-menu-dropdown"
						>
							{items.map((item) => (
								<div key={item.key || item.label}>
									{item.divider && (
										<MenuSeparator className="app-menu-divider" />
									)}
									<MenuItem>
										{({ focus }) => (
											<button
												type="button"
												className={`${focus ? "app-menu-item--active" : ""}${item.danger ? " app-menu-danger" : ""}${item.comingSoon ? " overlay-coming-soon" : ""}	${
													item.disabled ? "opacity-50 pointer-events-none" : ""
												}`}
												onClick={item.onClick}
											>
												<span className={item.icon} aria-hidden="true" />
												<div className="flex flex-col w-full truncate">
													<span className="app-menu-label">{item.label}</span>
													{item.subText && (
														<small className="opacity-60 truncate w-full">
															{item.subText}
														</small>
													)}
												</div>
											</button>
										)}
									</MenuItem>
								</div>
							))}
						</MenuItems>
					</>
				);
			}}
		</Menu>
	);
}
