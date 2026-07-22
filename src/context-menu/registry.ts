import type {
	CommandDefinition,
	CommandHandler,
	CommandId,
	CommandShortcut,
	CommandTarget,
	ContextMenuId,
	ResolvedMenuItem,
} from "./types";

const shortcut = (
	key: string,
	macModifiers: CommandShortcut["modifiers"],
	otherModifiers: CommandShortcut["modifiers"],
) => ({
	mac: { key, modifiers: macModifiers },
	windowsLinux: { key, modifiers: otherModifiers },
});

const DEFINITIONS: CommandDefinition[] = [
	{
		id: "edit.undo",
		label: "Undo",
		icon: "icon-rotate-ccw",
		macSymbol: "arrow.uturn.backward",
		shortcuts: shortcut("z", ["meta"], ["ctrl"]),
	},
	{
		id: "edit.redo",
		label: "Redo",
		icon: "icon-rotate-cw",
		macSymbol: "arrow.uturn.forward",
		shortcuts: shortcut("z", ["meta", "shift"], ["ctrl", "shift"]),
	},
	{
		id: "edit.cut",
		label: "Cut",
		icon: "icon-scissors",
		macSymbol: "scissors",
		shortcuts: shortcut("x", ["meta"], ["ctrl"]),
	},
	{
		id: "edit.copy",
		label: "Copy",
		icon: "icon-copy",
		macSymbol: "doc.on.doc",
		shortcuts: shortcut("c", ["meta"], ["ctrl"]),
	},
	{
		id: "edit.paste",
		label: "Paste",
		icon: "icon-clipboard",
		macSymbol: "doc.on.clipboard",
		shortcuts: shortcut("v", ["meta"], ["ctrl"]),
	},
	{
		id: "edit.selectAll",
		label: "Select All",
		icon: "icon-check-square",
		macSymbol: "selection.pin.in.out",
		shortcuts: shortcut("a", ["meta"], ["ctrl"]),
	},
	{
		id: "editor.definition",
		label: "Go to Definition",
		icon: "icon-arrow-right",
		macSymbol: "arrow.right.to.line",
		shortcuts: { mac: { key: "F12" }, windowsLinux: { key: "F12" } },
	},
	{
		id: "editor.peekDefinition",
		label: "Peek Definition",
		icon: "icon-eye",
		macSymbol: "eye",
	},
	{
		id: "editor.references",
		label: "Go to References",
		icon: "icon-list",
		macSymbol: "list.bullet",
		radio: true,
		shortcuts: {
			mac: { key: "F12", modifiers: ["shift"] },
			windowsLinux: { key: "F12", modifiers: ["shift"] },
		},
	},
	{
		id: "editor.renameSymbol",
		label: "Rename Symbol",
		icon: "icon-edit-2",
		macSymbol: "pencil",
		shortcuts: { mac: { key: "F2" }, windowsLinux: { key: "F2" } },
	},
	{
		id: "editor.formatDocument",
		label: "Format Document",
		icon: "icon-align-left",
		macSymbol: "text.alignleft",
		shortcuts: shortcut("f", ["alt", "shift"], ["alt", "shift"]),
	},
	{
		id: "editor.openFile",
		label: "Open File",
		icon: "icon-file-text",
		macSymbol: "doc.text",
	},
	{
		id: "terminal.clear",
		label: "Clear",
		icon: "icon-trash-2",
		macSymbol: "clear",
	},
	{
		id: "terminal.rename",
		label: "Rename Terminal",
		icon: "icon-edit-2",
		macSymbol: "pencil",
	},
	{
		id: "terminal.kill",
		label: "Kill Terminal",
		icon: "icon-x",
		macSymbol: "xmark.circle",
		danger: true,
	},
	{
		id: "tab.pin",
		label: "Pin Tab",
		icon: "icon-pin",
		macSymbol: "pin",
	},
	{
		id: "tab.unpin",
		label: "Unpin Tab",
		icon: "icon-pin-off",
		macSymbol: "pin.slash",
	},
	{
		id: "tab.moveToPane",
		label: "Move to Pane…",
		icon: "icon-arrow-right",
		macSymbol: "rectangle.portrait.and.arrow.right",
	},
	{
		id: "tab.splitLeft",
		label: "Split Left",
		icon: "icon-panel-left",
		macSymbol: "rectangle.split.2x1",
	},
	{
		id: "tab.splitRight",
		label: "Split Right",
		icon: "icon-panel-right",
		macSymbol: "rectangle.split.2x1",
	},
	{
		id: "tab.splitUp",
		label: "Split Up",
		icon: "icon-panel-top",
		macSymbol: "rectangle.split.1x2",
	},
	{
		id: "tab.splitDown",
		label: "Split Down",
		icon: "icon-panel-bottom",
		macSymbol: "rectangle.split.1x2",
	},
	{
		id: "tab.close",
		label: "Close",
		icon: "icon-x",
		macSymbol: "xmark",
		shortcuts: shortcut("w", ["meta"], ["ctrl"]),
	},
	{
		id: "tab.closeOthers",
		label: "Close Others",
		icon: "icon-x",
		macSymbol: "rectangle.stack.badge.minus",
	},
	{
		id: "tab.closeRight",
		label: "Close to the Right",
		icon: "icon-arrow-right",
		macSymbol: "arrow.right.to.line",
	},
	{
		id: "tab.closeAll",
		label: "Close All",
		icon: "icon-x-circle",
		macSymbol: "xmark.rectangle",
	},
	{
		id: "pane.close",
		label: "Close Pane",
		icon: "icon-x-square",
		macSymbol: "rectangle.badge.xmark",
		danger: true,
	},
	{
		id: "pane.closeTileGroup",
		label: "Close Tile Group",
		icon: "icon-grid",
		macSymbol: "rectangle.split.2x1",
		danger: true,
	},
	{
		id: "resource.open",
		label: "Open",
		icon: "icon-file-text",
		macSymbol: "doc.text",
	},
	{
		id: "resource.newFile",
		label: "New File",
		icon: "icon-file-plus",
		macSymbol: "doc.badge.plus",
	},
	{
		id: "resource.newFolder",
		label: "New Folder",
		icon: "icon-folder-plus",
		macSymbol: "folder.badge.plus",
	},
	{
		id: "resource.copyPath",
		label: "Copy Path",
		icon: "icon-copy",
		macSymbol: "doc.on.doc",
	},
	{
		id: "resource.copyRelativePath",
		label: "Copy Relative Path",
		icon: "icon-copy",
		macSymbol: "doc.on.doc",
	},
	{
		id: "resource.reveal",
		label: "Reveal in Finder",
		icon: "icon-external-link",
		macSymbol: "folder",
	},
	{
		id: "resource.rename",
		label: "Rename",
		icon: "icon-edit-2",
		macSymbol: "pencil",
	},
	{
		id: "resource.refresh",
		label: "Refresh",
		icon: "icon-refresh-cw",
		macSymbol: "arrow.clockwise",
	},
	{
		id: "resource.delete",
		label: "Delete",
		icon: "icon-trash",
		macSymbol: "trash",
		danger: true,
	},
	{
		id: "project.search",
		label: "Search",
		icon: "icon-search",
		macSymbol: "magnifyingglass",
	},
	{
		id: "project.newChat",
		label: "New Chat",
		icon: "icon-ai-chat",
		macSymbol: "bubble.left.and.bubble.right",
	},
	{
		id: "project.refreshSessions",
		label: "Refresh Sessions",
		icon: "icon-refresh-cw",
		macSymbol: "arrow.clockwise",
	},
	{
		id: "project.openGit",
		label: "Open Git",
		icon: "icon-git-branch",
		macSymbol: "arrow.triangle.branch",
	},
	{
		id: "project.openTerminal",
		label: "Open in Terminal",
		icon: "icon-terminal",
		macSymbol: "terminal",
	},
	{
		id: "project.close",
		label: "Close Project",
		icon: "icon-x",
		macSymbol: "xmark.circle",
	},
	{
		id: "git.openChanges",
		label: "Open Changes",
		icon: "icon-git-branch",
		macSymbol: "arrow.left.arrow.right",
	},
	{
		id: "git.stage",
		label: "Stage Changes",
		icon: "icon-plus",
		macSymbol: "plus",
	},
	{
		id: "git.unstage",
		label: "Unstage Changes",
		icon: "icon-minus",
		macSymbol: "minus",
	},
	{
		id: "git.discard",
		label: "Discard Changes",
		icon: "icon-rotate-ccw",
		macSymbol: "arrow.uturn.backward",
		danger: true,
	},
	{
		id: "git.listView",
		label: "List View",
		icon: "icon-list",
		macSymbol: "list.bullet",
	},
	{
		id: "git.treeView",
		label: "Tree View",
		icon: "icon-account_tree",
		macSymbol: "list.bullet.indent",
		radio: true,
	},
	{
		id: "git.switchBranch",
		label: "Switch Branch…",
		icon: "icon-git-branch",
		macSymbol: "arrow.triangle.branch",
	},
	{
		id: "git.pull",
		label: "Pull",
		icon: "icon-arrow-down",
		macSymbol: "arrow.down",
	},
	{
		id: "git.push",
		label: "Push",
		icon: "icon-upload-cloud",
		macSymbol: "arrow.up",
	},
	{
		id: "git.fetch",
		label: "Fetch",
		icon: "icon-download-cloud",
		macSymbol: "arrow.down.circle",
	},
	{
		id: "git.history",
		label: "Open History",
		icon: "icon-list",
		macSymbol: "clock.arrow.circlepath",
	},
];

const definitions = new Map(
	DEFINITIONS.map((definition) => [definition.id, definition]),
);

const MENUS: Record<ContextMenuId, readonly (readonly CommandId[])[]> = {
	"text-edit": [
		["edit.undo", "edit.redo"],
		["edit.cut", "edit.copy", "edit.paste"],
		["edit.selectAll"],
	],
	"text-selection": [["edit.copy"]],
	editor: [
		[
			"editor.definition",
			"editor.peekDefinition",
			"editor.references",
			"editor.renameSymbol",
			"editor.formatDocument",
		],
		["edit.undo", "edit.redo"],
		["edit.cut", "edit.copy", "edit.paste"],
		["edit.selectAll"],
	],
	"editor-diff": [["edit.copy", "edit.selectAll"], ["editor.openFile"]],
	terminal: [
		["edit.copy", "edit.paste"],
		["edit.selectAll", "terminal.clear"],
		["terminal.rename", "terminal.kill"],
	],
	"workbench-tab": [
		["tab.pin", "tab.unpin"],
		[
			"tab.moveToPane",
			"tab.splitLeft",
			"tab.splitRight",
			"tab.splitUp",
			"tab.splitDown",
		],
		["tab.close", "tab.closeOthers", "tab.closeRight", "tab.closeAll"],
		["pane.close", "pane.closeTileGroup"],
		["resource.copyPath", "resource.reveal"],
	],
	"project-tree-file": [
		["resource.open"],
		["resource.copyPath", "resource.copyRelativePath", "resource.reveal"],
		["resource.rename", "resource.refresh"],
		["resource.delete"],
	],
	"project-tree-directory": [
		["resource.newFile", "resource.newFolder"],
		["resource.copyPath", "resource.copyRelativePath", "resource.reveal"],
		["resource.rename", "resource.refresh"],
		["resource.delete"],
	],
	"git-change": [
		["git.openChanges", "resource.open"],
		["git.stage", "git.unstage", "git.discard"],
		["resource.copyPath", "resource.copyRelativePath", "resource.reveal"],
	],
	"git-group": [["git.stage", "git.unstage", "git.discard"]],
	"git-repository": [
		["git.listView", "git.treeView"],
		["resource.refresh", "git.switchBranch"],
		["git.pull", "git.push", "git.fetch"],
		["git.history"],
	],
	"project-pane": [],
	"action-menu": [],
};

export function registerCommandDefinition(definition: CommandDefinition) {
	definitions.set(definition.id, definition);
	return () => {
		if (definitions.get(definition.id) === definition)
			definitions.delete(definition.id);
	};
}

export function resolveContextMenu(
	menuId: ContextMenuId,
	target: CommandTarget,
	platform = browserPlatform(),
): ResolvedMenuItem[] {
	const groups = MENUS[menuId] ?? [];
	const resolvedGroups = groups
		.map((group) =>
			group.flatMap((id) => resolveCommand(id, target.handlers[id], platform)),
		)
		.filter((group) => group.length > 0);
	return resolvedGroups.flatMap((group, index) =>
		index === 0 ? group : [{ type: "separator" } as const, ...group],
	);
}

export function resolveCommandGroups(
	groups: readonly (readonly CommandId[])[],
	target: CommandTarget,
	platform = browserPlatform(),
): ResolvedMenuItem[] {
	const resolved = groups
		.map((group) =>
			group.flatMap((id) => resolveCommand(id, target.handlers[id], platform)),
		)
		.filter((group) => group.length > 0);
	return resolved.flatMap((group, index) =>
		index === 0 ? group : [{ type: "separator" } as const, ...group],
	);
}

export function resolveCommandItems(
	ids: readonly CommandId[],
	target: CommandTarget,
	platform = browserPlatform(),
) {
	return ids.flatMap((id) => resolveCommand(id, target.handlers[id], platform));
}

function resolveCommand(
	id: CommandId,
	handler: CommandHandler | undefined,
	platform: "mac" | "windowsLinux",
): ResolvedMenuItem[] {
	const definition = definitions.get(id);
	if (!definition || !handler || !evaluate(handler.visible, true)) return [];
	const shortcutValue = definition.shortcuts?.[platform];
	return [
		{
			type: "command",
			command: id,
			label: evaluateValue(handler.label, definition.label),
			icon: definition.icon,
			macSymbol: definition.macSymbol,
			shortcut: shortcutValue,
			shortcutLabel: shortcutValue
				? formatShortcut(shortcutValue, platform)
				: undefined,
			danger: definition.danger,
			disabled: !evaluate(handler.enabled, true),
			checked:
				handler.checked === undefined
					? undefined
					: evaluate(handler.checked, false),
			radio: definition.radio,
		},
	];
}

export async function executeContextCommand(
	target: CommandTarget,
	command: CommandId,
) {
	const handler = target.handlers[command];
	if (
		!handler ||
		!evaluate(handler.visible, true) ||
		!evaluate(handler.enabled, true)
	)
		return false;
	await handler.run();
	return true;
}

export function formatShortcut(
	shortcutValue: CommandShortcut,
	platform: "mac" | "windowsLinux",
) {
	const requested = new Set(shortcutValue.modifiers ?? []);
	const modifiers = (["ctrl", "alt", "shift", "meta"] as const).filter(
		(modifier) => requested.has(modifier),
	);
	if (platform === "mac") {
		const symbols = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" } as const;
		return `${modifiers.map((modifier) => symbols[modifier]).join("")}${shortcutValue.key.length === 1 ? shortcutValue.key.toUpperCase() : shortcutValue.key}`;
	}
	const names = {
		ctrl: "Ctrl",
		alt: "Alt",
		shift: "Shift",
		meta: "Meta",
	} as const;
	return [
		...modifiers.map((modifier) => names[modifier]),
		shortcutValue.key.length === 1
			? shortcutValue.key.toUpperCase()
			: shortcutValue.key,
	].join("+");
}

function evaluate(
	value: boolean | (() => boolean) | undefined,
	fallback: boolean,
) {
	try {
		return typeof value === "function" ? value() : (value ?? fallback);
	} catch {
		return false;
	}
}

function evaluateValue(
	value: string | (() => string) | undefined,
	fallback: string,
) {
	try {
		return typeof value === "function" ? value() : (value ?? fallback);
	} catch {
		return fallback;
	}
}

function browserPlatform(): "mac" | "windowsLinux" {
	return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
		? "mac"
		: "windowsLinux";
}
