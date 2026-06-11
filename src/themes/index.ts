import native from "bridge/native";
import scanner from "bridge/scanner";
import type Theme from "classes/theme";

type ThemeListener = (theme: Theme) => void;

const listeners = new Set<ThemeListener>();
let currentTheme: Theme | null = null;

function emitTheme(theme: Theme) {
	currentTheme = theme;
	for (const listener of listeners) {
		listener(theme);
	}
}

export default {
	async get(name: string) {
		let theme: Theme;
		switch (name.toLowerCase()) {
			case "light": {
				const themeModule = await import("./light");
				theme = themeModule.default;
				break;
			}

			case "oled": {
				const themeModule = await import("./oled");
				theme = themeModule.default;
				break;
			}

			default: {
				const themeModule = await import("./dark");
				theme = themeModule.default;
			}
		}

		return theme;
	},
	/**
	 * Apply a theme by name — updates CSS vars, native UI, and scanner.
	 * Also writes primaryColor/primaryTextColor to localStorage as a fast-load
	 * cache for the inline script in index.html (which runs before JS loads).
	 */
	async applyTheme(name: string) {
		const theme = await this.get(name);
		scanner.setTheme(theme);
		await native.setTheme(theme);
		// Single source of truth for theme type. CSS keys icon colors off this
		// attribute (e.g. .icon-cursor stays brand color, flips to white on dark)
		// so individual components never need theme-aware color logic.
		document.documentElement.dataset.themeType = theme.type;
		emitTheme(theme);
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
	 * Get the list of available themes.
	 *
	 * @returns {string[]} The list of themes.
	 */
	get list(): string[] {
		return ["Light", "Dark", "OLED"];
	},
	/**
	 * Checks if a theme name exists in the list of themes.
	 * @param {string} name - The name of the theme to check.
	 * @returns {boolean} - Returns true if the theme exists, false otherwise.
	 */
	has(name: string): boolean {
		return this.list.map((t) => t.toLowerCase()).includes(name.toLowerCase());
	},
	get current(): Theme | null {
		return currentTheme;
	},
	subscribe(listener: ThemeListener): () => void {
		listeners.add(listener);
		if (currentTheme) {
			listener(currentTheme);
		}
		return () => listeners.delete(listener);
	},
};
