import native from "bridge/native";
import scanner from "bridge/scanner";
import type Theme from "classes/theme";
import { toThemeId } from "./id";

export type ThemeOption = {
	id: string;
	label: string;
	type: "light" | "dark";
};

type ThemeDefinition = ThemeOption & {
	aliases?: readonly string[];
	load: () => Promise<Theme>;
};

const definitions: readonly ThemeDefinition[] = [
	{
		id: "light",
		label: "Light",
		type: "light",
		load: async () => (await import("./light")).default,
	},
	{
		id: "dark",
		label: "Dark",
		type: "dark",
		load: async () => (await import("./dark")).default,
	},
	{
		id: "oled",
		label: "OLED",
		type: "dark",
		aliases: ["black"],
		load: async () => (await import("./oled")).default,
	},
	{
		id: "one-dark-pro",
		label: "One Dark Pro",
		type: "dark",
		load: async () => (await import("./popular")).oneDarkProTheme,
	},
	{
		id: "dracula",
		label: "Dracula",
		type: "dark",
		load: async () => (await import("./popular")).draculaTheme,
	},
	{
		id: "github-dark",
		label: "GitHub Dark",
		type: "dark",
		aliases: ["github-dark-default"],
		load: async () => (await import("./popular")).githubDarkTheme,
	},
	{
		id: "github-light",
		label: "GitHub Light",
		type: "light",
		aliases: ["github-light-default"],
		load: async () => (await import("./popular")).githubLightTheme,
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
		type: "dark",
		load: async () => (await import("./popular")).tokyoNightTheme,
	},
	{
		id: "catppuccin-mocha",
		label: "Catppuccin Mocha",
		type: "dark",
		load: async () => (await import("./popular")).catppuccinMochaTheme,
	},
];

const fallbackDefinition =
	definitions.find(({ id }) => id === "dark") ?? definitions[0];
const listeners = new Set<(theme: Theme) => void>();
let currentTheme: Theme | null = null;
let currentThemeId: string | null = null;

function findDefinition(name: string): ThemeDefinition | undefined {
	const id = toThemeId(name);
	return definitions.find(
		(definition) =>
			definition.id === id ||
			toThemeId(definition.label) === id ||
			definition.aliases?.some((alias) => toThemeId(alias) === id),
	);
}

function resolveDefinition(name: string): ThemeDefinition {
	return findDefinition(name) ?? fallbackDefinition;
}

function emitTheme(theme: Theme, id: string) {
	currentTheme = theme;
	currentThemeId = id;
	for (const listener of listeners) {
		listener(theme);
	}
}

export const themeOptions: readonly ThemeOption[] = definitions.map(
	({ id, label, type }) => ({ id, label, type }),
);

export default {
	async get(name: string) {
		return resolveDefinition(name).load();
	},
	/**
	 * Apply a theme by name — updates CSS vars, native UI, and scanner.
	 * Also writes primaryColor/primaryTextColor to localStorage as a fast-load
	 * cache for the inline script in index.html (which runs before JS loads).
	 */
	async applyTheme(name: string) {
		const definition = resolveDefinition(name);
		const theme = await definition.load();
		scanner.setTheme(theme);
		await native.setTheme(theme);
		// Single source of truth for theme type. CSS keys icon colors off this
		// attribute (e.g. .icon-cursor stays brand color, flips to white on dark)
		// so individual components never need theme-aware color logic.
		document.documentElement.dataset.themeType = theme.type;
		emitTheme(theme, definition.id);
		// Write-through cache: index.html reads these synchronously for instant
		// background color before the bundle loads. File system (settings.json)
		// is the source of truth for which theme is active.
		try {
			localStorage.setItem("primaryColor", theme.primary);
			localStorage.setItem("primaryTextColor", theme.primaryText);
		} catch {
			// Ignore — failure just means no instant color on next cold load
		}
	},
	/**
	 * Labels retained for callers that only need display names.
	 */
	get list(): string[] {
		return themeOptions.map(({ label }) => label);
	},
	get options(): readonly ThemeOption[] {
		return themeOptions;
	},
	/**
	 * Checks whether a theme ID, label, or supported alias exists.
	 */
	has(name: string): boolean {
		return Boolean(findDefinition(name));
	},
	resolveId(name: string): string {
		return resolveDefinition(name).id;
	},
	get current(): Theme | null {
		return currentTheme;
	},
	get currentId(): string | null {
		return currentThemeId;
	},
	subscribe(listener: (theme: Theme) => void): () => void {
		listeners.add(listener);
		if (currentTheme) {
			listener(currentTheme);
		}
		return () => listeners.delete(listener);
	},
};
