export type DesktopShortcutPlatform = "mac" | "windows" | "linux";

export type DesktopMenuCommand =
	| "new-chat"
	| "new-file"
	| "new-terminal"
	| "open-file"
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
	| "show-explorer"
	| "project-search"
	| "show-source-control"
	| "ports"
	| "system-monitor"
	| "settings"
	| "help"
	| "reach-out"
	| "about";

export type EditorKeybindingCommand =
	| "editor.definition"
	| "editor.peekDefinition"
	| "editor.references"
	| "editor.renameSymbol"
	| "editor.formatDocument";

export type WorkbenchNavigationCommand =
	| "toggle-terminal"
	| "open-keyboard-shortcuts"
	| "next-tab"
	| "previous-tab"
	| "focus-pane-1"
	| "focus-pane-2"
	| "focus-pane-3"
	| "focus-pane-4"
	| "focus-pane-5"
	| "focus-pane-6"
	| "focus-pane-7"
	| "focus-pane-8"
	| "focus-pane-9"
	| "focus-pane-left"
	| "focus-pane-right"
	| "focus-pane-up"
	| "focus-pane-down"
	| "move-tab-left"
	| "move-tab-right"
	| "move-tab-previous-pane"
	| "move-tab-next-pane"
	| "close-pane"
	| "close-other-tabs"
	| "close-tabs-right"
	| "close-all-tabs";

export type DesktopKeyboardCommand =
	| "contextual-new"
	| DesktopMenuCommand
	| EditorKeybindingCommand
	| WorkbenchNavigationCommand;

export type ShortcutModifier = "ctrl" | "alt" | "shift" | "meta";

export interface ShortcutStroke {
	key: string;
	modifiers?: ShortcutModifier[];
}

export interface ShortcutBinding {
	strokes: [ShortcutStroke] | [ShortcutStroke, ShortcutStroke];
}

export type DesktopCommandEnablement =
	| "always"
	| "active-surface"
	| "editable"
	| "save"
	| "editor"
	| "pane";

export type DesktopCommandCategory =
	| "File"
	| "Edit"
	| "Editor"
	| "Terminal"
	| "View"
	| "Navigation"
	| "Help";

export type DesktopMenuName = "File" | "Edit" | "View" | "Help";

export interface DesktopCommandDefinition {
	label: string;
	category: DesktopCommandCategory;
	enablement: DesktopCommandEnablement;
	configurable: boolean;
	defaultBindings: Record<DesktopShortcutPlatform, ShortcutBinding[]>;
	allowInTerminal?: boolean;
	allowInEditable?: boolean;
	menu?: {
		name: DesktopMenuName;
		order: number;
		divider?: boolean;
	};
}

export type KeybindingOverrides = Partial<
	Record<
		DesktopShortcutPlatform,
		Partial<Record<DesktopKeyboardCommand, ShortcutBinding[]>>
	>
>;

export type ResolvedKeybindings = Record<
	DesktopKeyboardCommand,
	ShortcutBinding[]
>;

interface ShortcutDefinition {
	command: DesktopKeyboardCommand;
	bindings: ShortcutBinding[];
}

const none = (): Record<DesktopShortcutPlatform, ShortcutBinding[]> => ({
	mac: [],
	windows: [],
	linux: [],
});

const binding = (
	key: string,
	modifiers: ShortcutModifier[] = [],
): ShortcutBinding => ({
	strokes: [{ key, modifiers }],
});

const chord = (
	firstKey: string,
	firstModifiers: ShortcutModifier[],
	secondKey: string,
	secondModifiers: ShortcutModifier[],
): ShortcutBinding => ({
	strokes: [
		{ key: firstKey, modifiers: firstModifiers },
		{ key: secondKey, modifiers: secondModifiers },
	],
});

const meta = (key: string, ...modifiers: ShortcutModifier[]) =>
	binding(key, ["meta", ...modifiers]);
const ctrl = (key: string, ...modifiers: ShortcutModifier[]) =>
	binding(key, ["ctrl", ...modifiers]);
const all = (value: ShortcutBinding) => ({
	mac: [value],
	windows: [value],
	linux: [value],
});
const primary = (key: string, ...modifiers: ShortcutModifier[]) => ({
	mac: [meta(key, ...modifiers)],
	windows: [ctrl(key, ...modifiers)],
	linux: [ctrl(key, ...modifiers)],
});
const primaryChord = (
	firstKey: string,
	secondKey: string,
	secondModifiers: ShortcutModifier[] = [],
) => ({
	mac: [chord(firstKey, ["meta"], secondKey, ["meta", ...secondModifiers])],
	windows: [chord(firstKey, ["ctrl"], secondKey, ["ctrl", ...secondModifiers])],
	linux: [chord(firstKey, ["ctrl"], secondKey, ["ctrl", ...secondModifiers])],
});

const command = (
	label: string,
	category: DesktopCommandCategory,
	enablement: DesktopCommandEnablement,
	defaultBindings = none(),
	options: Pick<
		DesktopCommandDefinition,
		"allowInTerminal" | "allowInEditable" | "menu"
	> = {},
): DesktopCommandDefinition => ({
	label,
	category,
	enablement,
	configurable: true,
	defaultBindings,
	...options,
});

export const DESKTOP_COMMANDS = {
	"contextual-new": command("New", "File", "always", primary("n")),
	"new-file": command("New File", "File", "always", none(), {
		menu: { name: "File", order: 10 },
	}),
	"new-chat": command("New Chat", "File", "always", none(), {
		menu: { name: "File", order: 20 },
	}),
	"toggle-terminal": command(
		"Toggle Terminal",
		"Terminal",
		"always",
		all(ctrl("`")),
		{ allowInTerminal: true },
	),
	"new-terminal": command(
		"New Terminal",
		"Terminal",
		"always",
		all(ctrl("`", "shift")),
		{
			allowInTerminal: true,
			menu: { name: "File", order: 30 },
		},
	),
	"open-file": command("Open File…", "File", "always", primary("o"), {
		menu: { name: "File", order: 40, divider: true },
	}),
	"open-folder": command(
		"Open Folder…",
		"File",
		"always",
		primaryChord("k", "o"),
		{ menu: { name: "File", order: 50 } },
	),
	save: command("Save", "File", "save", primary("s"), {
		menu: { name: "File", order: 60, divider: true },
	}),
	"close-tab": command(
		"Close Tab",
		"File",
		"active-surface",
		{
			mac: [meta("w")],
			windows: [ctrl("F4")],
			linux: [ctrl("w")],
		},
		{
			allowInTerminal: true,
			menu: { name: "File", order: 70 },
		},
	),
	undo: command("Undo", "Edit", "editable", primary("z"), {
		allowInEditable: true,
		menu: { name: "Edit", order: 10 },
	}),
	redo: command(
		"Redo",
		"Edit",
		"editable",
		{
			mac: [meta("z", "shift")],
			windows: [ctrl("y")],
			linux: [ctrl("y")],
		},
		{
			allowInEditable: true,
			menu: { name: "Edit", order: 20 },
		},
	),
	cut: command("Cut", "Edit", "editable", primary("x"), {
		allowInEditable: true,
		menu: { name: "Edit", order: 30, divider: true },
	}),
	copy: command("Copy", "Edit", "editable", primary("c"), {
		allowInEditable: true,
		menu: { name: "Edit", order: 40 },
	}),
	paste: command("Paste", "Edit", "editable", primary("v"), {
		allowInEditable: true,
		menu: { name: "Edit", order: 50 },
	}),
	"select-all": command("Select All", "Edit", "editable", primary("a"), {
		allowInEditable: true,
		menu: { name: "Edit", order: 60, divider: true },
	}),
	"editor.definition": command(
		"Go to Definition",
		"Editor",
		"editor",
		all(binding("F12")),
	),
	"editor.peekDefinition": command("Peek Definition", "Editor", "editor", {
		mac: [binding("F12", ["alt"])],
		windows: [binding("F12", ["alt"])],
		linux: [binding("F10", ["ctrl", "shift"])],
	}),
	"editor.references": command(
		"Go to References",
		"Editor",
		"editor",
		all(binding("F12", ["shift"])),
	),
	"editor.renameSymbol": command(
		"Rename Symbol",
		"Editor",
		"editor",
		all(binding("F2")),
	),
	"editor.formatDocument": command("Format Document", "Editor", "editor", {
		mac: [binding("f", ["alt", "shift"])],
		windows: [binding("f", ["alt", "shift"])],
		linux: [binding("i", ["ctrl", "shift"])],
	}),
	"toggle-sidebar": command("Toggle Sidebar", "View", "always", primary("b"), {
		allowInTerminal: true,
		menu: { name: "View", order: 10 },
	}),
	"show-explorer": command(
		"Explorer",
		"View",
		"always",
		primary("e", "shift"),
		{
			allowInTerminal: true,
			menu: { name: "View", order: 20, divider: true },
		},
	),
	"project-search": command(
		"Project Search",
		"View",
		"always",
		primary("f", "shift"),
		{
			allowInTerminal: true,
			menu: { name: "View", order: 30 },
		},
	),
	"show-source-control": command(
		"Source Control",
		"View",
		"always",
		{
			mac: [ctrl("g", "shift")],
			windows: [ctrl("g", "shift")],
			linux: [ctrl("g", "shift")],
		},
		{
			allowInTerminal: true,
			menu: { name: "View", order: 40 },
		},
	),
	ports: command("Ports", "View", "always", none(), {
		allowInTerminal: true,
		menu: { name: "View", order: 50, divider: true },
	}),
	"system-monitor": command("System Monitor", "View", "always", none(), {
		allowInTerminal: true,
		menu: { name: "View", order: 60 },
	}),
	settings: command("Settings", "View", "always", primary(","), {
		allowInTerminal: true,
		menu: { name: "View", order: 70, divider: true },
	}),
	"open-keyboard-shortcuts": command(
		"Keyboard Shortcuts",
		"View",
		"always",
		primaryChord("k", "s"),
	),
	"next-tab": command(
		"Open Next Tab",
		"Navigation",
		"active-surface",
		all(ctrl("Tab")),
		{ allowInTerminal: true },
	),
	"previous-tab": command(
		"Open Previous Tab",
		"Navigation",
		"active-surface",
		all(ctrl("Tab", "shift")),
		{ allowInTerminal: true },
	),
	"focus-pane-1": command(
		"Focus First Pane",
		"Navigation",
		"pane",
		primary("1"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-2": command(
		"Focus Second Pane",
		"Navigation",
		"pane",
		primary("2"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-3": command(
		"Focus Third Pane",
		"Navigation",
		"pane",
		primary("3"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-4": command(
		"Focus Fourth Pane",
		"Navigation",
		"pane",
		primary("4"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-5": command(
		"Focus Fifth Pane",
		"Navigation",
		"pane",
		primary("5"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-6": command(
		"Focus Sixth Pane",
		"Navigation",
		"pane",
		primary("6"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-7": command(
		"Focus Seventh Pane",
		"Navigation",
		"pane",
		primary("7"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-8": command(
		"Focus Eighth Pane",
		"Navigation",
		"pane",
		primary("8"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-9": command(
		"Focus Ninth Pane",
		"Navigation",
		"pane",
		primary("9"),
		{
			allowInTerminal: true,
		},
	),
	"focus-pane-left": command(
		"Focus Pane Left",
		"Navigation",
		"pane",
		primaryChord("k", "ArrowLeft"),
	),
	"focus-pane-right": command(
		"Focus Pane Right",
		"Navigation",
		"pane",
		primaryChord("k", "ArrowRight"),
	),
	"focus-pane-up": command(
		"Focus Pane Above",
		"Navigation",
		"pane",
		primaryChord("k", "ArrowUp"),
	),
	"focus-pane-down": command(
		"Focus Pane Below",
		"Navigation",
		"pane",
		primaryChord("k", "ArrowDown"),
	),
	"move-tab-left": command("Move Tab Left", "Navigation", "active-surface", {
		mac: [chord("k", ["meta"], "ArrowLeft", ["meta", "shift"])],
		windows: [ctrl("PageUp", "shift")],
		linux: [ctrl("PageUp", "shift")],
	}),
	"move-tab-right": command("Move Tab Right", "Navigation", "active-surface", {
		mac: [chord("k", ["meta"], "ArrowRight", ["meta", "shift"])],
		windows: [ctrl("PageDown", "shift")],
		linux: [ctrl("PageDown", "shift")],
	}),
	"move-tab-previous-pane": command(
		"Move Tab to Previous Pane",
		"Navigation",
		"pane",
		{
			mac: [binding("ArrowLeft", ["ctrl", "meta"])],
			windows: [binding("ArrowLeft", ["ctrl", "alt"])],
			linux: [binding("ArrowLeft", ["ctrl", "alt"])],
		},
		{ allowInTerminal: true },
	),
	"move-tab-next-pane": command(
		"Move Tab to Next Pane",
		"Navigation",
		"pane",
		{
			mac: [binding("ArrowRight", ["ctrl", "meta"])],
			windows: [binding("ArrowRight", ["ctrl", "alt"])],
			linux: [binding("ArrowRight", ["ctrl", "alt"])],
		},
		{ allowInTerminal: true },
	),
	"close-pane": command("Close Pane", "Navigation", "pane", {
		mac: [chord("k", ["meta"], "w", [])],
		windows: [chord("k", ["ctrl"], "w", [])],
		linux: [chord("k", ["ctrl"], "w", [])],
	}),
	"close-other-tabs": command(
		"Close Other Tabs",
		"Navigation",
		"active-surface",
		none(),
		{ allowInTerminal: true },
	),
	"close-tabs-right": command(
		"Close Tabs to the Right",
		"Navigation",
		"active-surface",
		none(),
		{ allowInTerminal: true },
	),
	"close-all-tabs": command("Close All Tabs", "Navigation", "active-surface", {
		mac: [chord("k", ["meta"], "w", ["meta"])],
		windows: [chord("k", ["ctrl"], "w", ["ctrl"])],
		linux: [chord("k", ["ctrl"], "w", ["ctrl"])],
	}),
	help: command("Shellular Help", "Help", "always", none(), {
		allowInTerminal: true,
		menu: { name: "Help", order: 10 },
	}),
	"reach-out": command("Reach Out", "Help", "always", none(), {
		allowInTerminal: true,
		menu: { name: "Help", order: 20 },
	}),
	about: command("About", "Help", "always", none(), {
		allowInTerminal: true,
		menu: { name: "Help", order: 30, divider: true },
	}),
} satisfies Record<DesktopKeyboardCommand, DesktopCommandDefinition>;

export const DESKTOP_COMMAND_IDS = Object.keys(
	DESKTOP_COMMANDS,
) as DesktopKeyboardCommand[];

export interface DesktopMenuRegistryEntry {
	command: DesktopMenuCommand;
	label: string;
	divider?: boolean;
}

const DESKTOP_MENU_ORDER: DesktopMenuName[] = ["File", "Edit", "View", "Help"];

export const DESKTOP_MENUS = DESKTOP_MENU_ORDER.map((name) => ({
	label: name,
	items: (
		Object.entries(DESKTOP_COMMANDS) as Array<
			[DesktopKeyboardCommand, DesktopCommandDefinition]
		>
	)
		.filter(
			(entry): entry is [DesktopMenuCommand, DesktopCommandDefinition] =>
				entry[1].menu?.name === name,
		)
		.sort(
			(left, right) => (left[1].menu?.order ?? 0) - (right[1].menu?.order ?? 0),
		)
		.map(
			([commandId, definition]): DesktopMenuRegistryEntry => ({
				command: commandId,
				label: definition.label,
				divider: definition.menu?.divider,
			}),
		),
}));

export function desktopCommandEnablement(commandId: DesktopKeyboardCommand) {
	return DESKTOP_COMMANDS[commandId].enablement;
}

export function desktopCommandAllowsTerminal(
	commandId: DesktopKeyboardCommand,
) {
	return Boolean(DESKTOP_COMMANDS[commandId].allowInTerminal);
}

export function desktopCommandAllowsEditable(
	commandId: DesktopKeyboardCommand,
) {
	return Boolean(DESKTOP_COMMANDS[commandId].allowInEditable);
}

export function resolveKeybindings(
	platform: DesktopShortcutPlatform,
	overrides: KeybindingOverrides = {},
): ResolvedKeybindings {
	return Object.fromEntries(
		DESKTOP_COMMAND_IDS.map((commandId) => [
			commandId,
			cloneBindings(
				overrides[platform]?.[commandId] ??
					DESKTOP_COMMANDS[commandId].defaultBindings[platform],
			),
		]),
	) as ResolvedKeybindings;
}

export function shortcutForCommand(
	commandId: DesktopKeyboardCommand,
	platform: DesktopShortcutPlatform,
	overrides: KeybindingOverrides = {},
): ShortcutBinding | undefined {
	return resolveKeybindings(platform, overrides)[commandId][0];
}

export function defaultShortcutsForCommand(
	commandId: DesktopKeyboardCommand,
	platform: DesktopShortcutPlatform,
) {
	return cloneBindings(DESKTOP_COMMANDS[commandId].defaultBindings[platform]);
}

export function isCommandModified(
	commandId: DesktopKeyboardCommand,
	platform: DesktopShortcutPlatform,
	overrides: KeybindingOverrides,
) {
	return commandId in (overrides[platform] ?? {});
}

export function bindingIdentifier(value: ShortcutBinding) {
	return value.strokes
		.map((stroke) => {
			const modifiers = normalizedModifiers(stroke.modifiers ?? []);
			return `${modifiers.join("+")}${modifiers.length ? "+" : ""}${normalizeShortcutKey(stroke.key)}`;
		})
		.join(" ");
}

export function bindingsEqual(left: ShortcutBinding, right: ShortcutBinding) {
	return bindingIdentifier(left) === bindingIdentifier(right);
}

export function commandContextsOverlap(
	left: DesktopKeyboardCommand,
	right: DesktopKeyboardCommand,
) {
	const contexts: Record<DesktopCommandEnablement, ReadonlySet<string>> = {
		always: new Set(["workbench", "editor", "terminal", "editable"]),
		"active-surface": new Set(["workbench", "editor", "terminal"]),
		editable: new Set(["editor", "editable"]),
		save: new Set(["editor"]),
		editor: new Set(["editor"]),
		pane: new Set(["workbench", "editor", "terminal"]),
	};
	const leftContexts = contexts[DESKTOP_COMMANDS[left].enablement];
	const rightContexts = contexts[DESKTOP_COMMANDS[right].enablement];
	return [...leftContexts].some((context) => rightContexts.has(context));
}

export function findKeybindingConflicts(
	commandId: DesktopKeyboardCommand,
	bindingValue: ShortcutBinding,
	resolved: ResolvedKeybindings,
) {
	return DESKTOP_COMMAND_IDS.filter(
		(candidate) =>
			candidate !== commandId &&
			commandContextsOverlap(commandId, candidate) &&
			resolved[candidate].some((value) => bindingsEqual(value, bindingValue)),
	);
}

const MODIFIER_ORDER: ShortcutModifier[] = ["ctrl", "shift", "alt", "meta"];

function normalizedModifiers(modifiers: ShortcutModifier[]) {
	const requested = new Set(modifiers);
	return MODIFIER_ORDER.filter((modifier) => requested.has(modifier));
}

function cloneBindings(values: ShortcutBinding[]) {
	return values.map(normalizeShortcutBinding);
}

export function normalizeShortcutBinding(
	value: ShortcutBinding,
): ShortcutBinding {
	return {
		strokes: value.strokes.map((stroke) => ({
			key: normalizeShortcutKey(stroke.key),
			modifiers: normalizedModifiers(stroke.modifiers ?? []),
		})) as ShortcutBinding["strokes"],
	};
}

export function normalizeShortcutKey(key: string) {
	if (key === " ") return "Space";
	if (key.length === 1) return key.toLowerCase();
	const aliases: Record<string, string> = {
		Esc: "Escape",
		Left: "ArrowLeft",
		Right: "ArrowRight",
		Up: "ArrowUp",
		Down: "ArrowDown",
	};
	return aliases[key] ?? key;
}

export function shortcutEventKey(event: Pick<KeyboardEvent, "key" | "code">) {
	const byCode: Record<string, string> = {
		Backquote: "`",
		Comma: ",",
		Period: ".",
		Slash: "/",
		Semicolon: ";",
		Quote: "'",
		BracketLeft: "[",
		BracketRight: "]",
		Backslash: "\\",
		Minus: "-",
		Equal: "=",
		Space: "Space",
	};
	return byCode[event.code] ?? normalizeShortcutKey(event.key);
}

export function shortcutStrokeFromEvent(
	event: Pick<
		KeyboardEvent,
		"key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
	>,
): ShortcutStroke | null {
	if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
	const modifiers: ShortcutModifier[] = [];
	if (event.ctrlKey) modifiers.push("ctrl");
	if (event.shiftKey) modifiers.push("shift");
	if (event.altKey) modifiers.push("alt");
	if (event.metaKey) modifiers.push("meta");
	return { key: shortcutEventKey(event), modifiers };
}

export function matchesShortcutStroke(
	event: Pick<
		KeyboardEvent,
		"key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
	>,
	stroke: ShortcutStroke,
) {
	const requested = new Set(stroke.modifiers ?? []);
	return (
		shortcutEventKey(event) === normalizeShortcutKey(stroke.key) &&
		event.ctrlKey === requested.has("ctrl") &&
		event.altKey === requested.has("alt") &&
		event.shiftKey === requested.has("shift") &&
		event.metaKey === requested.has("meta")
	);
}

export type ShortcutMatch =
	| { type: "none" }
	| { type: "pending" }
	| { type: "command"; command: DesktopKeyboardCommand };

export class DesktopShortcutMatcher {
	private pending: ShortcutDefinition[] | null = null;
	private shortcuts: ShortcutDefinition[] = [];

	constructor(
		private readonly platform: DesktopShortcutPlatform,
		overrides: KeybindingOverrides = {},
	) {
		this.setOverrides(overrides);
	}

	setOverrides(overrides: KeybindingOverrides) {
		const resolved = resolveKeybindings(this.platform, overrides);
		this.shortcuts = DESKTOP_COMMAND_IDS.flatMap((commandId) =>
			resolved[commandId].length
				? [{ command: commandId, bindings: resolved[commandId] }]
				: [],
		);
		this.reset();
	}

	reset() {
		this.pending = null;
	}

	hasPendingChord() {
		return this.pending !== null;
	}

	handle(
		event: Pick<
			KeyboardEvent,
			"key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
		>,
		accepts: (commandId: DesktopKeyboardCommand) => boolean = () => true,
	): ShortcutMatch {
		if (this.pending) {
			if (event.key === "Escape") {
				this.reset();
				return { type: "none" };
			}
			const commandId = this.pending.find(
				(definition) =>
					accepts(definition.command) &&
					definition.bindings.some(
						(candidate) =>
							candidate.strokes.length === 2 &&
							matchesShortcutStroke(event, candidate.strokes[1]),
					),
			)?.command;
			this.reset();
			return commandId
				? { type: "command", command: commandId }
				: { type: "none" };
		}

		const matching = this.shortcuts.filter(
			(definition) =>
				accepts(definition.command) &&
				definition.bindings.some((candidate) =>
					matchesShortcutStroke(event, candidate.strokes[0]),
				),
		);
		const chordMatches = matching.filter((definition) =>
			definition.bindings.some((candidate) => candidate.strokes.length === 2),
		);
		if (chordMatches.length) {
			this.pending = chordMatches;
			return { type: "pending" };
		}
		const immediate = matching.find((definition) =>
			definition.bindings.some((candidate) => candidate.strokes.length === 1),
		);
		return immediate
			? { type: "command", command: immediate.command }
			: { type: "none" };
	}
}

export function detectDesktopShortcutPlatform(
	navigatorLike: Pick<Navigator, "platform" | "userAgent"> = navigator,
): DesktopShortcutPlatform {
	const value = `${navigatorLike.platform} ${navigatorLike.userAgent}`;
	if (/mac|iphone|ipad|ipod/i.test(value)) return "mac";
	if (/win/i.test(value)) return "windows";
	return "linux";
}

export function formatShortcutBinding(
	value: ShortcutBinding,
	platform: DesktopShortcutPlatform,
) {
	return value.strokes
		.map((stroke) => formatStroke(stroke, platform))
		.join(" ");
}

function formatStroke(
	stroke: ShortcutStroke,
	platform: DesktopShortcutPlatform,
) {
	const parts = formatShortcutStrokeParts(stroke, platform);
	return parts.join(platform === "mac" ? "" : "+");
}

export function formatShortcutStrokeParts(
	stroke: ShortcutStroke,
	platform: DesktopShortcutPlatform,
) {
	const requested = new Set(stroke.modifiers ?? []);
	const keyLabels: Record<string, string> = {
		ArrowLeft: "←",
		ArrowRight: "→",
		ArrowUp: "↑",
		ArrowDown: "↓",
		PageUp: "PageUp",
		PageDown: "PageDown",
		Space: "Space",
	};
	const normalizedKey = normalizeShortcutKey(stroke.key);
	const key =
		keyLabels[normalizedKey] ??
		(normalizedKey.length === 1 ? normalizedKey.toUpperCase() : normalizedKey);
	if (platform === "mac") {
		const symbols: Record<ShortcutModifier, string> = {
			ctrl: "⌃",
			alt: "⌥",
			shift: "⇧",
			meta: "⌘",
		};
		return [
			...MODIFIER_ORDER.filter((modifier) => requested.has(modifier)).map(
				(modifier) => symbols[modifier],
			),
			key,
		];
	}
	const labels: Record<ShortcutModifier, string> = {
		ctrl: "Ctrl",
		alt: "Alt",
		shift: "Shift",
		meta: "Meta",
	};
	return [
		...MODIFIER_ORDER.filter((modifier) => requested.has(modifier)).map(
			(modifier) => labels[modifier],
		),
		key,
	];
}
