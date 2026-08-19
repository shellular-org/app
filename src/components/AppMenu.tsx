import "./AppMenu.scss";
import {
	Menu,
	MenuButton,
	MenuItem,
	MenuItems,
	MenuSeparator,
} from "@headlessui/react";
import { showResolvedContextMenu } from "context-menu/service";
import type {
	CommandTarget,
	ContextMenuAnchor,
	ContextMenuTrigger,
	ResolvedMenuItem,
} from "context-menu/types";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef, useRef } from "react";

export interface AppMenuItem {
	key?: string;
	icon: string;
	macSymbol?: string;
	label: string;
	danger?: boolean;
	subText?: string;
	divider?: boolean;
	onClick: () => void;
	comingSoon?: boolean;
	disabled?: boolean;
	checked?: boolean;
	radio?: boolean;
}

interface Props {
	items: AppMenuItem[];
	children?: ReactNode;
	ariaLabel: string;
	disabled?: boolean;
	buttonClassName?: string;
	onToggle?: (open: boolean) => void;
	placement?: "bottom end" | "bottom start" | "top end" | "top start";
	/** Navigation and selection popovers can opt out of the desktop context-menu presenter. */
	contextual?: boolean;
}

export default function AppMenu({
	items,
	children,
	disabled,
	ariaLabel,
	onToggle,
	buttonClassName = "",
	placement = "bottom end",
	contextual = true,
}: Props) {
	if (process.env.IS_DESKTOP_UI && contextual) {
		return (
			<DesktopContextualMenuButton
				items={items}
				disabled={disabled}
				ariaLabel={ariaLabel}
				onToggle={onToggle}
				buttonClassName={buttonClassName}
			>
				{children}
			</DesktopContextualMenuButton>
		);
	}

	return (
		<LegacyAppMenu
			items={items}
			disabled={disabled}
			ariaLabel={ariaLabel}
			onToggle={onToggle}
			buttonClassName={buttonClassName}
			placement={placement}
		>
			{children}
		</LegacyAppMenu>
	);
}

function LegacyAppMenu({
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
										{({ focus }) => {
											const className = `${focus ? "app-menu-item--active" : ""}${item.danger ? " app-menu-danger" : ""}${item.comingSoon ? " overlay-coming-soon" : ""}	${item.disabled ? "opacity-50 pointer-events-none" : ""}`;
											const content = (
												<>
													<span
														className={item.checked ? "icon-check" : item.icon}
														aria-hidden="true"
													/>
													<div className="flex flex-col w-full truncate">
														<span className="app-menu-label">{item.label}</span>
														{item.subText && (
															<small className="opacity-60 truncate w-full">
																{item.subText}
															</small>
														)}
													</div>
												</>
											);
											return item.radio ? (
												<RadioMenuItemButton
													type="button"
													aria-checked={Boolean(item.checked)}
													className={className}
													onClick={item.onClick}
												>
													{content}
												</RadioMenuItemButton>
											) : (
												<button
													type="button"
													className={className}
													onClick={item.onClick}
												>
													{content}
												</button>
											);
										}}
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

function DesktopContextualMenuButton({
	items,
	children,
	disabled,
	ariaLabel,
	onToggle,
	buttonClassName = "",
}: Omit<Props, "placement" | "contextual">) {
	const openingRef = useRef(false);
	const open = async (
		origin: HTMLButtonElement,
		anchor: ContextMenuAnchor,
		trigger: ContextMenuTrigger,
	) => {
		if (disabled || openingRef.current) return;
		openingRef.current = true;
		onToggle?.(true);
		try {
			await showAppMenuItems(items, anchor, origin, trigger);
		} finally {
			openingRef.current = false;
			onToggle?.(false);
		}
	};
	return (
		<button
			type="button"
			className={buttonClassName}
			aria-label={ariaLabel}
			disabled={disabled}
			aria-haspopup="menu"
			onClick={(event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				void open(
					event.currentTarget,
					{
						kind: "rect",
						left: rect.left,
						top: rect.top,
						right: rect.right,
						bottom: rect.bottom,
					},
					"button",
				);
			}}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void open(
					event.currentTarget,
					{
						kind: "point",
						x: event.clientX,
						y: event.clientY,
					},
					"context",
				);
			}}
		>
			{children ?? (
				<span
					className={`icon-more-vertical w-8 h-full flex items-center justify-end ${disabled ? "opacity-50" : ""}`}
					aria-hidden={true}
				/>
			)}
		</button>
	);
}

export function showAppMenuItems(
	items: AppMenuItem[],
	anchor: ContextMenuAnchor,
	origin?: HTMLElement | null,
	trigger: ContextMenuTrigger = "button",
) {
	const target: CommandTarget = { handlers: {} };
	const resolved: ResolvedMenuItem[] = [];
	let hasCommand = false;
	for (const [index, item] of items.entries()) {
		if (
			item.divider &&
			hasCommand &&
			resolved[resolved.length - 1]?.type !== "separator"
		) {
			resolved.push({ type: "separator" });
		}
		const command = `action.${item.key ?? slug(item.label)}.${index}`;
		target.handlers[command] = {
			run: item.onClick,
			enabled: !item.disabled && !item.comingSoon,
		};
		resolved.push({
			type: "command",
			command,
			label: item.label,
			icon: item.icon,
			macSymbol: item.macSymbol ?? macSymbolForIcon(item.icon),
			danger: item.danger,
			disabled: item.disabled || item.comingSoon,
			checked:
				item.radio || item.checked !== undefined
					? Boolean(item.checked)
					: undefined,
			radio: item.radio,
		});
		hasCommand = true;
	}
	while (resolved[resolved.length - 1]?.type === "separator") resolved.pop();
	return showResolvedContextMenu(
		{ menuId: "action-menu", target, anchor, origin, trigger },
		resolved,
	);
}

function slug(label: string) {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function macSymbolForIcon(icon: string) {
	const symbols: Record<string, string> = {
		"icon-check": "checkmark",
		"icon-copy": "doc.on.doc",
		"icon-clipboard": "doc.on.clipboard",
		"icon-download": "arrow.down.circle",
		"icon-edit": "pencil",
		"icon-edit-2": "pencil",
		"icon-external-link": "arrow.up.forward.square",
		"icon-file": "doc",
		"icon-file-plus": "doc.badge.plus",
		"icon-folder-plus": "folder.badge.plus",
		"icon-git-branch": "arrow.triangle.branch",
		"icon-ai-chat": "bubble.left.and.bubble.right",
		"icon-plus": "plus",
		"icon-refresh-cw": "arrow.clockwise",
		"icon-share": "square.and.arrow.up",
		"icon-terminal": "terminal",
		"icon-trash": "trash",
		"icon-x": "xmark",
	};
	return symbols[icon];
}

const RadioMenuItemButton = forwardRef<
	HTMLButtonElement,
	ButtonHTMLAttributes<HTMLButtonElement> & { "aria-checked": boolean }
>(function RadioMenuItemButton(
	{ role: _headlessRole, "aria-checked": checked, ...props },
	ref,
) {
	return (
		<button {...props} ref={ref} role="menuitemradio" aria-checked={checked} />
	);
});
