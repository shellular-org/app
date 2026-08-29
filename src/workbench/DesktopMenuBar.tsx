import {
	Menu,
	MenuButton,
	MenuItem,
	MenuItems,
	MenuSeparator,
} from "@headlessui/react";
import { getKeybindingsSnapshot, subscribeKeybindings } from "lib/keybindings";
import { useSyncExternalStore } from "react";
import {
	DESKTOP_MENUS,
	type DesktopMenuCommand,
	detectDesktopShortcutPlatform,
	formatShortcutBinding,
	shortcutForCommand,
} from "./desktopShortcuts";

export type { DesktopMenuCommand } from "./desktopShortcuts";

export default function DesktopMenuBar({
	onCommand,
	isCommandEnabled,
	contextualNew,
}: {
	onCommand: (command: DesktopMenuCommand) => unknown | Promise<unknown>;
	isCommandEnabled: (command: DesktopMenuCommand) => boolean;
	contextualNew: "new-chat" | "new-file";
}) {
	const keybindings = useSyncExternalStore(
		subscribeKeybindings,
		getKeybindingsSnapshot,
	);
	const platform = detectDesktopShortcutPlatform();
	const shortcutLabel = (command: DesktopMenuCommand) => {
		const shortcutCommand =
			command === contextualNew ? "contextual-new" : command;
		const value = shortcutForCommand(
			shortcutCommand,
			platform,
			keybindings.overrides,
		);
		return value ? formatShortcutBinding(value, platform) : undefined;
	};
	const focusSibling = (button: HTMLButtonElement, direction: -1 | 1) => {
		const buttons = Array.from(
			button
				.closest("[role=menubar]")
				?.querySelectorAll<HTMLButtonElement>("[data-workbench-menu]") ?? [],
		);
		const index = buttons.indexOf(button);
		if (index < 0 || buttons.length < 2) return;
		buttons[(index + direction + buttons.length) % buttons.length]?.focus();
	};

	return (
		<div
			className="flex h-full items-center gap-0.5"
			role="menubar"
			aria-label="Application menu"
		>
			{DESKTOP_MENUS.map((menu) => (
				<Menu as="div" className="contents" key={menu.label}>
					<MenuButton
						type="button"
						role="menuitem"
						data-workbench-menu
						className="flex h-7 items-center rounded px-2 text-[12px] font-medium text-secondary-text outline-none hover:bg-surface-soft hover:text-primary-text focus-visible:bg-surface-soft focus-visible:text-primary-text data-[open]:bg-surface-strong data-[open]:text-primary-text"
						onKeyDown={(event) => {
							if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
								return;
							event.preventDefault();
							focusSibling(
								event.currentTarget,
								event.key === "ArrowRight" ? 1 : -1,
							);
						}}
					>
						{menu.label}
					</MenuButton>
					<MenuItems
						anchor={{ to: "bottom start", gap: 4, padding: 6 }}
						portal
						modal={false}
						transition
						className="z-[10002] min-w-56 origin-top-left overflow-hidden rounded-lg border border-card-border bg-popup-background p-1 text-primary-text shadow-[var(--shadow)] outline-none transition duration-100 data-[closed]:-translate-y-1 data-[closed]:scale-95 data-[closed]:opacity-0"
					>
						{menu.items.map((item) => {
							const enabled = isCommandEnabled(item.command);
							const shortcut = shortcutLabel(item.command);
							return (
								<div key={item.command}>
									{item.divider && (
										<MenuSeparator className="mx-1 my-1 h-px bg-card-border" />
									)}
									<MenuItem disabled={!enabled}>
										{({ focus }) => (
											<button
												type="button"
												aria-label={item.label}
												disabled={!enabled}
												className={`flex h-8 w-full items-center justify-between gap-6 rounded-md px-2.5 text-left text-xs outline-none ${focus ? "bg-surface-soft" : ""} disabled:opacity-40`}
												onClick={() => void onCommand(item.command)}
											>
												<span>{item.label}</span>
												{shortcut && (
													<span className="text-[10px] text-secondary-text">
														{shortcut}
													</span>
												)}
											</button>
										)}
									</MenuItem>
								</div>
							);
						})}
					</MenuItems>
				</Menu>
			))}
		</div>
	);
}
