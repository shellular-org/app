import {
	type KeyboardEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
	canRunDomEditCommand,
	runDomEditCommand,
	type WorkbenchEditCommand,
} from "workbench/domEditCommands";
import { currentVisualViewport, placeContextMenu } from "./position";
import {
	dismissContextMenu,
	getContextMenuSnapshot,
	selectContextMenuCommand,
	showContextMenu,
	subscribeContextMenu,
} from "./service";
import type { ResolvedMenuItem } from "./types";

export default function ContextMenuHost() {
	const snapshot = useSyncExternalStore(
		subscribeContextMenu,
		getContextMenuSnapshot,
		getContextMenuSnapshot,
	);
	const menuRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({
		left: -10000,
		top: -10000,
		maxHeight: 0,
	});
	const [focused, setFocused] = useState(0);
	const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
	const typeahead = useRef("");
	const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!process.env.IS_DESKTOP_UI) return;
		const suppress = (event: MouseEvent) => event.preventDefault();
		const provideFallback = (event: MouseEvent) => {
			const pathTarget = event
				.composedPath()
				.find((entry) => entry instanceof HTMLElement);
			const target = pathTarget instanceof HTMLElement ? pathTarget : null;
			const editable = editableElement(target);
			const selection = window.getSelection();
			const hasSelection = Boolean(
				selection && !selection.isCollapsed && selection.toString(),
			);
			if (!editable && !hasSelection) return;
			const origin = editable ?? target;
			const bounds = origin?.getBoundingClientRect();
			const anchor =
				event.clientX || event.clientY || !bounds
					? { kind: "point" as const, x: event.clientX, y: event.clientY }
					: {
							kind: "rect" as const,
							left: bounds.left,
							top: bounds.top,
							right: bounds.right,
							bottom: bounds.bottom,
						};
			void showContextMenu({
				menuId: editable ? "text-edit" : "text-selection",
				anchor,
				trigger:
					event.button !== 2 &&
					!event.ctrlKey &&
					!event.clientX &&
					!event.clientY
						? "keyboard"
						: "context",
				origin,
				target: createDomCommandTarget(editable ?? target),
			});
		};
		document.addEventListener("contextmenu", suppress, { capture: true });
		document.addEventListener("contextmenu", provideFallback);
		return () => {
			document.removeEventListener("contextmenu", suppress, { capture: true });
			document.removeEventListener("contextmenu", provideFallback);
		};
	}, []);

	useLayoutEffect(() => {
		if (!snapshot || !menuRef.current) return;
		const menu = menuRef.current;
		const update = () => {
			setPosition(
				placeContextMenu(
					snapshot.invocation.anchor,
					menu.getBoundingClientRect(),
					currentVisualViewport(),
				),
			);
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(menu);
		window.addEventListener("resize", update);
		window.visualViewport?.addEventListener("resize", update);
		window.visualViewport?.addEventListener("scroll", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("scroll", update);
		};
	}, [snapshot]);

	useEffect(() => {
		if (!snapshot) return;
		setFocused(firstEnabled(snapshot.items));
		setOpenSubmenu(null);
		requestAnimationFrame(() =>
			menuRef.current?.focus({ preventScroll: true }),
		);
	}, [snapshot]);

	useEffect(
		() => () => {
			if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
		},
		[],
	);

	if (!snapshot || process.env.IS_MACOS) return null;
	const selectableItems = menuEntries(snapshot.items);
	const move = (direction: 1 | -1) => {
		if (selectableItems.length === 0) return;
		let next = focused;
		for (let count = 0; count < selectableItems.length; count += 1) {
			next =
				(next + direction + selectableItems.length) % selectableItems.length;
			if (!isDisabled(selectableItems[next])) break;
		}
		setOpenSubmenu(null);
		setFocused(next);
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			dismissContextMenu();
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			move(1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			move(-1);
		} else if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			setFocused(
				event.key === "Home"
					? firstEnabled(snapshot.items)
					: lastEnabled(snapshot.items),
			);
		} else if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			const item = selectableItems[focused];
			if (item?.type === "submenu") setOpenSubmenu(focused);
			else if (item && !item.disabled)
				void selectContextMenuCommand(snapshot.id, item.command);
		} else if (event.key === "ArrowRight") {
			const item = selectableItems[focused];
			if (item?.type === "submenu") {
				event.preventDefault();
				setOpenSubmenu(focused);
			}
		} else if (event.key.length === 1 && /\S/.test(event.key)) {
			typeahead.current += event.key.toLowerCase();
			if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
			typeaheadTimer.current = setTimeout(() => {
				typeahead.current = "";
			}, 500);
			const index = selectableItems.findIndex(
				(item) =>
					!isDisabled(item) &&
					item.label.toLowerCase().startsWith(typeahead.current),
			);
			if (index >= 0) setFocused(index);
		}
	};

	let itemIndex = -1;
	return createPortal(
		<>
			<button
				type="button"
				aria-label="Close context menu"
				className="fixed inset-0 z-[12000] cursor-default bg-transparent"
				onPointerDown={() => dismissContextMenu()}
			/>
			<div
				ref={menuRef}
				role="menu"
				tabIndex={-1}
				aria-label="Context menu"
				className="desktop-scroll-area fixed z-[12001] min-w-48 max-w-80 overflow-x-hidden overflow-y-auto rounded-md border border-card-border bg-popup-background p-1 text-xs text-primary-text shadow-[var(--shadow)] outline-none"
				style={{
					left: position.left,
					top: position.top,
					maxHeight: position.maxHeight,
				}}
				onKeyDown={onKeyDown}
			>
				{snapshot.items.map((item) => {
					if (item.type === "separator") {
						return (
							<hr
								key={`separator-after-${itemIndex}`}
								className="my-1 border-0 border-t border-line-soft"
							/>
						);
					}
					itemIndex += 1;
					const selectableIndex = itemIndex;
					if (item.type === "submenu") {
						return (
							<BrowserSubmenu
								key={`submenu-${item.label}`}
								item={item}
								invocationId={snapshot.id}
								active={selectableIndex === focused}
								open={openSubmenu === selectableIndex}
								onFocus={() => {
									setFocused(selectableIndex);
									setOpenSubmenu(selectableIndex);
								}}
								onClose={() => {
									setOpenSubmenu(null);
									menuRef.current?.focus({ preventScroll: true });
								}}
							/>
						);
					}
					return (
						<button
							key={item.command}
							type="button"
							{...(item.radio
								? {
										role: "menuitemradio" as const,
										"aria-checked": Boolean(item.checked),
									}
								: item.checked === undefined
									? { role: "menuitem" as const }
									: {
											role: "menuitemcheckbox" as const,
											"aria-checked": item.checked,
										})}
							disabled={item.disabled}
							className={`flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left outline-none ${selectableIndex === focused ? "bg-surface-soft" : "bg-transparent"} ${item.danger ? "text-danger" : "text-primary-text"} disabled:opacity-40`}
							onPointerMove={() => {
								if (item.disabled) return;
								setOpenSubmenu(null);
								setFocused(selectableIndex);
							}}
							onClick={() =>
								void selectContextMenuCommand(snapshot.id, item.command)
							}
						>
							<span
								className={`${item.checked ? "icon-check" : (item.icon ?? "")} grid size-4 shrink-0 place-items-center text-[13px]`}
								aria-hidden="true"
							/>
							<span className="min-w-0 flex-1 truncate">{item.label}</span>
							{item.shortcutLabel && (
								<kbd className="ml-4 shrink-0 font-sans text-[11px] text-secondary-text">
									{item.shortcutLabel}
								</kbd>
							)}
						</button>
					);
				})}
			</div>
		</>,
		document.body,
	);
}

type SubmenuItem = Extract<ResolvedMenuItem, { type: "submenu" }>;

function BrowserSubmenu({
	item,
	invocationId,
	active,
	open,
	onFocus,
	onClose,
}: {
	item: SubmenuItem;
	invocationId: number;
	active: boolean;
	open: boolean;
	onFocus: () => void;
	onClose: () => void;
}) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({
		left: -10000,
		top: -10000,
		maxHeight: 0,
	});
	const entries = menuEntries(item.items);
	const [focused, setFocused] = useState(firstEnabled(item.items));
	const [openChild, setOpenChild] = useState<number | null>(null);
	useLayoutEffect(() => {
		if (!open || !triggerRef.current || !panelRef.current) return;
		const update = () => {
			const trigger = triggerRef.current?.getBoundingClientRect();
			const panel = panelRef.current?.getBoundingClientRect();
			if (!trigger || !panel) return;
			setPosition(placeSubmenu(trigger, panel, currentVisualViewport()));
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(panelRef.current);
		window.addEventListener("resize", update);
		window.visualViewport?.addEventListener("resize", update);
		window.visualViewport?.addEventListener("scroll", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("scroll", update);
		};
	}, [open]);
	useEffect(() => {
		if (!open) return;
		setFocused(firstEnabled(item.items));
		setOpenChild(null);
		requestAnimationFrame(() =>
			panelRef.current?.focus({ preventScroll: true }),
		);
	}, [item.items, open]);
	const move = (direction: 1 | -1) => {
		if (!entries.length) return;
		let next = focused;
		for (let count = 0; count < entries.length; count += 1) {
			next = (next + direction + entries.length) % entries.length;
			if (!isDisabled(entries[next])) break;
		}
		setOpenChild(null);
		setFocused(next);
	};
	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				role="menuitem"
				aria-haspopup="menu"
				aria-expanded={open}
				className={`flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left outline-none ${active ? "bg-surface-soft" : "bg-transparent"}`}
				onPointerEnter={onFocus}
				onFocus={onFocus}
				onClick={onFocus}
			>
				<span
					className={`${item.icon ?? ""} grid size-4 shrink-0 place-items-center text-[13px]`}
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1 truncate">{item.label}</span>
				<span className="icon-chevron-right text-[10px]" aria-hidden="true" />
			</button>
			{open &&
				createPortal(
					<div
						ref={panelRef}
						role="menu"
						tabIndex={-1}
						className="desktop-scroll-area fixed z-[12002] min-w-48 max-w-80 overflow-x-hidden overflow-y-auto rounded-md border border-card-border bg-popup-background p-1 text-xs text-primary-text shadow-[var(--shadow)] outline-none"
						style={{
							left: position.left,
							top: position.top,
							maxHeight: position.maxHeight,
						}}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === "ArrowDown") {
								event.preventDefault();
								move(1);
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								move(-1);
							} else if (event.key === "ArrowLeft" || event.key === "Escape") {
								event.preventDefault();
								onClose();
							} else if (event.key === "Home" || event.key === "End") {
								event.preventDefault();
								setFocused(
									event.key === "Home"
										? firstEnabled(item.items)
										: lastEnabled(item.items),
								);
							} else if (event.key === "ArrowRight") {
								const selected = entries[focused];
								if (selected?.type === "submenu") {
									event.preventDefault();
									setOpenChild(focused);
								}
							} else if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								const selected = entries[focused];
								if (selected?.type === "command" && !selected.disabled) {
									void selectContextMenuCommand(invocationId, selected.command);
								} else if (selected?.type === "submenu") {
									setOpenChild(focused);
								}
							}
						}}
					>
						{item.items.map((child, index) => {
							if (child.type === "separator") {
								return (
									<hr
										key={separatorKey(item.items, index)}
										className="my-1 border-0 border-t border-line-soft"
									/>
								);
							}
							const childIndex = entries.indexOf(child);
							if (child.type === "submenu") {
								return (
									<BrowserSubmenu
										key={`submenu-${child.label}`}
										item={child}
										invocationId={invocationId}
										active={childIndex === focused}
										open={openChild === childIndex}
										onFocus={() => {
											setFocused(childIndex);
											setOpenChild(childIndex);
										}}
										onClose={() => {
											setOpenChild(null);
											panelRef.current?.focus({ preventScroll: true });
										}}
									/>
								);
							}
							return (
								<button
									key={child.command}
									type="button"
									{...(child.radio
										? {
												role: "menuitemradio" as const,
												"aria-checked": Boolean(child.checked),
											}
										: child.checked === undefined
											? { role: "menuitem" as const }
											: {
													role: "menuitemcheckbox" as const,
													"aria-checked": child.checked,
												})}
									disabled={child.disabled}
									className={`flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left outline-none ${childIndex === focused ? "bg-surface-soft" : "bg-transparent"} ${child.danger ? "text-danger" : "text-primary-text"} disabled:opacity-40`}
									onPointerMove={() =>
										!child.disabled && setFocused(childIndex)
									}
									onClick={() =>
										void selectContextMenuCommand(invocationId, child.command)
									}
								>
									<span
										className={`${child.checked ? "icon-check" : (child.icon ?? "")} grid size-4 shrink-0 place-items-center text-[13px]`}
										aria-hidden="true"
									/>
									<span className="min-w-0 flex-1 truncate">{child.label}</span>
									{child.shortcutLabel && (
										<kbd className="ml-4 shrink-0 font-sans text-[11px] text-secondary-text">
											{child.shortcutLabel}
										</kbd>
									)}
								</button>
							);
						})}
					</div>,
					document.body,
				)}
		</>
	);
}

const DOM_COMMANDS: Record<string, WorkbenchEditCommand> = {
	"edit.undo": "undo",
	"edit.redo": "redo",
	"edit.cut": "cut",
	"edit.copy": "copy",
	"edit.paste": "paste",
	"edit.selectAll": "select-all",
};

function createDomCommandTarget(target: HTMLElement | null) {
	return {
		handlers: Object.fromEntries(
			Object.entries(DOM_COMMANDS).map(([id, command]) => [
				id,
				{
					run: () => runDomEditCommand(command, target),
					enabled: () => canRunDomEditCommand(command, target),
				},
			]),
		),
	};
}

function editableElement(target: HTMLElement | null) {
	if (!target) return null;
	if (target instanceof HTMLTextAreaElement) return target;
	if (
		target instanceof HTMLInputElement &&
		/^(?:text|search|url|tel|email|password|number)$/i.test(target.type)
	)
		return target;
	return target.isContentEditable
		? target
		: target.closest<HTMLElement>("[contenteditable=true]");
}

function menuEntries(items: ResolvedMenuItem[]) {
	return items.filter((item) => item.type !== "separator");
}

function isDisabled(
	item: Exclude<ResolvedMenuItem, { type: "separator" }> | undefined,
) {
	return item?.type === "command" ? Boolean(item.disabled) : false;
}

function firstEnabled(items: ResolvedMenuItem[]) {
	const index = menuEntries(items).findIndex((item) => !isDisabled(item));
	return Math.max(0, index);
}

function lastEnabled(items: ResolvedMenuItem[]) {
	const entries = menuEntries(items);
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		if (!isDisabled(entries[index])) return index;
	}
	return 0;
}

function placeSubmenu(
	anchor: { left: number; top: number; right: number; bottom: number },
	menu: { width: number; height: number },
	viewport: { left: number; top: number; width: number; height: number },
	margin = 8,
) {
	const gap = 4;
	const viewportRight = viewport.left + viewport.width;
	const viewportBottom = viewport.top + viewport.height;
	const fitsRight = anchor.right + gap + menu.width <= viewportRight - margin;
	const left = fitsRight
		? anchor.right + gap
		: Math.max(viewport.left + margin, anchor.left - menu.width - gap);
	const maxTop = Math.max(
		viewport.top + margin,
		viewportBottom - menu.height - margin,
	);
	return {
		left,
		top: Math.max(viewport.top + margin, Math.min(anchor.top, maxTop)),
		maxHeight: Math.max(40, viewport.height - margin * 2),
	};
}

function separatorKey(items: ResolvedMenuItem[], index: number) {
	for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
		const item = items[cursor];
		if (item?.type === "command") return `separator-after-${item.command}`;
		if (item?.type === "submenu") return `separator-after-${item.label}`;
	}
	return "separator-start";
}
