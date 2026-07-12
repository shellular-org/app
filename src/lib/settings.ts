import file from "bridge/file";
import appConfig from "lib/appConfig";

export type ServerProtocol = "http" | "https";

export type ServerSettings = {
	protocol: ServerProtocol;
	domain: string;
};

export type EditorSettings = {
	fontSize: number;
	fontFamily: string;
	wordWrap: boolean;
	lineNumbers: boolean;
	tabSize: number;
};

export type TerminalCursorStyle = "block" | "underline" | "bar";

export type TerminalKeyboardMode = "terminal" | "text" | "numeric";

export const TERMINAL_TOOLBAR_KEY_IDS = [
	"esc",
	"tab",
	"ctrl",
	"alt",
	"shift",
	"home",
	"end",
	"up",
	"down",
	"left",
	"right",
	"pageup",
	"pagedown",
	"interrupt",
	"switchTerminal",
	"del",
] as const;

export type TerminalToolbarKeyId = (typeof TERMINAL_TOOLBAR_KEY_IDS)[number];

export const DEFAULT_TERMINAL_TOOLBAR_ROWS: TerminalToolbarKeyId[][] = [
	["esc", "shift", "home", "end", "up", "switchTerminal", "pageup"],
	["tab", "ctrl", "alt", "left", "down", "right", "pagedown"],
];

export type TerminalSettings = {
	fontSize: number;
	fontFamily: string;
	cursorStyle: TerminalCursorStyle;
	cursorInactiveStyle: TerminalCursorStyle | "outline" | "none";
	cursorBlink: boolean;
	scrollback: number;
	letterSpacing: number;
	keyboardMode: TerminalKeyboardMode;
	toolbarRows: string[][];
};

export type AppSettings = {
	theme: string;
	server: ServerSettings;
	editor: EditorSettings;
	terminal: TerminalSettings;
	showHiddenFiles: boolean;
	hapticFeedback: boolean;
};

const SETTINGS_PATH = `${appConfig.DATA_DIR}/settings.json`;
export const SETTINGS_CHANGED_EVENT = "shellular:settings-changed";

export type FontFamilyOption = {
	value: string;
	label: string;
	stack: string;
};

export const MONOSPACE_FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
	{
		value: "jetbrains-mono",
		label: "JetBrains Mono",
		stack:
			"'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Courier New', monospace",
	},
	{
		value: "fira-code",
		label: "Fira Code",
		stack: "'Fira Code', 'Courier New', monospace",
	},
	{
		value: "system-mono",
		label: "System Monospace",
		stack:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
	},
];

export function getFontFamilyStack(value: string): string {
	return (
		MONOSPACE_FONT_FAMILY_OPTIONS.find((option) => option.value === value)
			?.stack ?? MONOSPACE_FONT_FAMILY_OPTIONS[0].stack
	);
}

function normalizeFontFamily(value: unknown): string {
	return typeof value === "string" &&
		MONOSPACE_FONT_FAMILY_OPTIONS.some((option) => option.value === value)
		? value
		: MONOSPACE_FONT_FAMILY_OPTIONS[0].value;
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
	protocol: "https",
	domain: appConfig.DEFAULT_SERVER,
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
	fontSize: 14,
	fontFamily: "jetbrains-mono",
	wordWrap: true,
	lineNumbers: true,
	tabSize: 4,
};

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
	fontSize: 14,
	fontFamily: "jetbrains-mono",
	cursorStyle: "block",
	cursorInactiveStyle: "outline",
	cursorBlink: true,
	scrollback: 500,
	letterSpacing: 1,
	keyboardMode: "terminal",
	toolbarRows: DEFAULT_TERMINAL_TOOLBAR_ROWS.map((row) => [...row]),
};

const DEFAULT_SETTINGS: AppSettings = {
	theme: "dark",
	server: DEFAULT_SERVER_SETTINGS,
	editor: DEFAULT_EDITOR_SETTINGS,
	terminal: DEFAULT_TERMINAL_SETTINGS,
	showHiddenFiles: false,
	hapticFeedback: true,
};

function normalizeDomain(domain: string): string {
	return domain
		.trim()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");
}

function normalizeServerSettings(
	settings?: Partial<ServerSettings> | null,
): ServerSettings {
	return {
		protocol:
			settings?.protocol === "http" || settings?.protocol === "https"
				? settings.protocol
				: DEFAULT_SERVER_SETTINGS.protocol,
		domain: normalizeDomain(settings?.domain || DEFAULT_SERVER_SETTINGS.domain),
	};
}

function normalizeEditorSettings(
	settings?: Partial<EditorSettings> | null,
): EditorSettings {
	return {
		fontSize:
			typeof settings?.fontSize === "number"
				? settings.fontSize
				: DEFAULT_EDITOR_SETTINGS.fontSize,
		fontFamily: normalizeFontFamily(settings?.fontFamily),
		wordWrap:
			typeof settings?.wordWrap === "boolean"
				? settings.wordWrap
				: DEFAULT_EDITOR_SETTINGS.wordWrap,
		lineNumbers:
			typeof settings?.lineNumbers === "boolean"
				? settings.lineNumbers
				: DEFAULT_EDITOR_SETTINGS.lineNumbers,
		tabSize:
			typeof settings?.tabSize === "number"
				? Math.min(8, Math.max(1, Math.round(settings.tabSize)))
				: DEFAULT_EDITOR_SETTINGS.tabSize,
	};
}

function normalizeTerminalCursorStyle(
	value: unknown,
	fallback: TerminalCursorStyle,
): TerminalCursorStyle {
	return value === "block" || value === "underline" || value === "bar"
		? value
		: fallback;
}

function normalizeTerminalCursorInactiveStyle(
	value: unknown,
	fallback: TerminalSettings["cursorInactiveStyle"],
): TerminalSettings["cursorInactiveStyle"] {
	return value === "block" ||
		value === "underline" ||
		value === "bar" ||
		value === "outline" ||
		value === "none"
		? value
		: fallback;
}


function normalizeTerminalToolbarRows(value: unknown): string[][] {
	if (!Array.isArray(value)) {
		return DEFAULT_TERMINAL_TOOLBAR_ROWS.map((row) => [...row]);
	}
	const seen = new Set<string>();
	const normalized = [0, 1].map((rowIndex) => {
		const row = Array.isArray(value[rowIndex])
			? value[rowIndex]
			: DEFAULT_TERMINAL_TOOLBAR_ROWS[rowIndex];
		return row.filter((id): id is TerminalToolbarKeyId => {
			if (
				typeof id !== "string" ||
				!TERMINAL_TOOLBAR_KEY_IDS.includes(id as TerminalToolbarKeyId) ||
				seen.has(id)
			) {
				return false;
			}
			seen.add(id);
			return true;
		});
	});

	for (let rowIndex = 0; rowIndex < normalized.length; rowIndex += 1) {
		if (normalized[rowIndex].length > 0) continue;
		const fallback =
			DEFAULT_TERMINAL_TOOLBAR_ROWS[rowIndex].find((id) => !seen.has(id)) ??
			TERMINAL_TOOLBAR_KEY_IDS.find((id) => !seen.has(id));
		if (fallback) {
			normalized[rowIndex].push(fallback);
			seen.add(fallback);
		} else {
			const donorRow = normalized[rowIndex === 0 ? 1 : 0];
			const preferredId = DEFAULT_TERMINAL_TOOLBAR_ROWS[rowIndex].find((id) =>
				donorRow.includes(id),
			);
			const donorIndex = preferredId ? donorRow.indexOf(preferredId) : 0;
			normalized[rowIndex].push(donorRow.splice(donorIndex, 1)[0]);
		}
	}

	return normalized;
}

function normalizeTerminalSettings(
	settings?: Partial<TerminalSettings> | null,
): TerminalSettings {
	return {
		fontSize:
			typeof settings?.fontSize === "number"
				? settings.fontSize
				: DEFAULT_TERMINAL_SETTINGS.fontSize,
		fontFamily: normalizeFontFamily(settings?.fontFamily),
		cursorStyle: normalizeTerminalCursorStyle(
			settings?.cursorStyle,
			DEFAULT_TERMINAL_SETTINGS.cursorStyle,
		),
		cursorInactiveStyle: normalizeTerminalCursorInactiveStyle(
			settings?.cursorInactiveStyle,
			DEFAULT_TERMINAL_SETTINGS.cursorInactiveStyle,
		),
		cursorBlink:
			typeof settings?.cursorBlink === "boolean"
				? settings.cursorBlink
				: DEFAULT_TERMINAL_SETTINGS.cursorBlink,
		scrollback:
			typeof settings?.scrollback === "number"
				? Math.min(10000, Math.max(100, Math.round(settings.scrollback)))
				: DEFAULT_TERMINAL_SETTINGS.scrollback,
		letterSpacing:
			typeof settings?.letterSpacing === "number"
				? Math.min(8, Math.max(-2, Math.round(settings.letterSpacing)))
				: DEFAULT_TERMINAL_SETTINGS.letterSpacing,
		keyboardMode:
			settings?.keyboardMode === "text" ||
			settings?.keyboardMode === "numeric" ||
			settings?.keyboardMode === "terminal"
				? settings.keyboardMode
				: DEFAULT_TERMINAL_SETTINGS.keyboardMode,
		toolbarRows: normalizeTerminalToolbarRows(settings?.toolbarRows),
	};
}

function normalizeSettings(
	settings: Partial<AppSettings> | null | undefined,
): AppSettings {
	return {
		theme: settings?.theme || DEFAULT_SETTINGS.theme,
		server: normalizeServerSettings(settings?.server),
		editor: normalizeEditorSettings(settings?.editor),
		terminal: normalizeTerminalSettings(settings?.terminal),
		showHiddenFiles:
			typeof settings?.showHiddenFiles === "boolean"
				? settings.showHiddenFiles
				: DEFAULT_SETTINGS.showHiddenFiles,
		hapticFeedback:
			typeof settings?.hapticFeedback === "boolean"
				? settings.hapticFeedback
				: DEFAULT_SETTINGS.hapticFeedback,
	};
}

export async function loadSettings(): Promise<AppSettings> {
	try {
		const exists = await file.exists(SETTINGS_PATH);
		if (!exists) return normalizeSettings(undefined);
		const text = (await file.read(SETTINGS_PATH, "text")) as string;
		return normalizeSettings(JSON.parse(text) as Partial<AppSettings>);
	} catch {
		return normalizeSettings(undefined);
	}
}

type DeepPartial<T> = T extends readonly unknown[]
	? T
	: T extends object
		? {
				[P in keyof T]?: DeepPartial<T[P]>;
			}
		: T;

export async function saveSettings(
	settings: DeepPartial<AppSettings>,
): Promise<void> {
	const current = await loadSettings();
	const next = normalizeSettings({
		...current,
		...settings,
		server: {
			...current.server,
			...settings.server,
		},
		editor: {
			...current.editor,
			...settings.editor,
		},
		terminal: {
			...current.terminal,
			...settings.terminal,
		},
	});
	await file.write(SETTINGS_PATH, JSON.stringify(next));
	window.dispatchEvent(
		new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: next }),
	);
}

export async function getBaseServerUrl(): Promise<string> {
	const settings = await loadSettings();
	const domain = normalizeDomain(settings.server.domain);
	return `${settings.server.protocol}://${domain || DEFAULT_SERVER_SETTINGS.domain}`;
}
