import {
	Menu,
	MenuButton,
	MenuItem,
	MenuItems,
	MenuSeparator,
} from "@headlessui/react";

export type DesktopMenuCommand =
	| "new-chat"
	| "new-terminal"
	| "open-folder"
	| "save"
	| "close-tab"
	| "undo"
	| "redo"
	| "cut"
	| "copy"
	| "paste"
	| "select-all"
	| "toggle-sidebar"
	| "ports"
	| "system-monitor"
	| "help"
	| "reach-out"
	| "about";

interface MenuEntry {
	command: DesktopMenuCommand;
	label: string;
	shortcut?: string;
	divider?: boolean;
}

const MENUS: Array<{ label: string; items: MenuEntry[] }> = [
	{
		label: "File",
		items: [
			{ command: "new-chat", label: "New Chat" },
			{ command: "new-terminal", label: "New Terminal" },
			{ command: "open-folder", label: "Open Folder…" },
			{ command: "save", label: "Save", shortcut: "⌘S", divider: true },
			{ command: "close-tab", label: "Close Tab", shortcut: "⌘W" },
		],
	},
	{
		label: "Edit",
		items: [
			{ command: "undo", label: "Undo", shortcut: "⌘Z" },
			{ command: "redo", label: "Redo", shortcut: "⇧⌘Z" },
			{ command: "cut", label: "Cut", shortcut: "⌘X", divider: true },
			{ command: "copy", label: "Copy", shortcut: "⌘C" },
			{ command: "paste", label: "Paste", shortcut: "⌘V" },
			{
				command: "select-all",
				label: "Select All",
				shortcut: "⌘A",
				divider: true,
			},
		],
	},
	{
		label: "View",
		items: [
			{ command: "toggle-sidebar", label: "Toggle Sidebar", shortcut: "⌘B" },
			{ command: "ports", label: "Ports", divider: true },
			{ command: "system-monitor", label: "System Monitor" },
		],
	},
	{
		label: "Help",
		items: [
			{ command: "help", label: "Shellular Help" },
			{ command: "reach-out", label: "Reach Out" },
			{ command: "about", label: "About", divider: true },
		],
	},
];

export default function DesktopMenuBar({
	onCommand,
	isCommandEnabled,
}: {
	onCommand: (command: DesktopMenuCommand) => void | Promise<void>;
	isCommandEnabled: (command: DesktopMenuCommand) => boolean;
}) {
	const macShortcuts =
		typeof navigator !== "undefined" &&
		/mac|iphone|ipad/i.test(navigator.platform);
	const shortcutLabel = (shortcut: string) => {
		if (macShortcuts) return shortcut;
		if (shortcut === "⇧⌘Z") return "Ctrl+Y";
		return shortcut.replace("⌘", "Ctrl+");
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
			{MENUS.map((menu) => (
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
												{item.shortcut && (
													<span className="text-[10px] text-secondary-text">
														{shortcutLabel(item.shortcut)}
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
