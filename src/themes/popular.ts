import Theme, { type ThemeSyntax } from "classes/theme";

type AnsiPalette = {
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
};

type PopularThemePalette = {
	name: string;
	type: "light" | "dark";
	background: string;
	foreground: string;
	surface: string;
	surfaceStrong: string;
	muted: string;
	secondaryText?: string;
	cardSubtextOpacity?: string;
	border: string;
	accent: string;
	accentForeground: string;
	accent2: string;
	danger: string;
	warning: string;
	success: string;
	info: string;
	ansi: AnsiPalette;
	syntax: ThemeSyntax;
};

function withAlpha(hex: string, alpha: number): string {
	const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, "0");
	return `${hex.slice(0, 7)}${byte}`;
}

class PopularTheme extends Theme {
	readonly #palette: PopularThemePalette;

	constructor(palette: PopularThemePalette) {
		super(
			palette.name,
			palette.type,
			palette.background,
			palette.foreground,
			palette.surface,
			palette.secondaryText ?? palette.muted,
		);
		this.#palette = palette;
	}

	get link() {
		return this.#palette.accent;
	}

	get info() {
		return this.#palette.info;
	}

	get primaryActiveText() {
		return this.#palette.accent;
	}

	get borderColor() {
		return this.#palette.border;
	}

	get shadowColor() {
		return this.#palette.type === "light"
			? "rgba(31, 35, 40, 0.14)"
			: "rgba(0, 0, 0, 0.55)";
	}

	get placeholder() {
		return withAlpha(this.#palette.muted, 0.18);
	}

	get input() {
		return this.#palette.surface;
	}

	get inputPlaceholder() {
		return withAlpha(this.#palette.muted, 0.72);
	}

	get buttonBackground() {
		return this.#palette.accent;
	}

	get buttonText() {
		return this.#palette.accentForeground;
	}

	get buttonBackgroundActive() {
		return this.#palette.accent2;
	}

	get popupText() {
		return this.#palette.foreground;
	}

	get popupBackground() {
		return this.#palette.surfaceStrong;
	}

	get popupBorderColor() {
		return this.#palette.border;
	}

	get popupActiveText() {
		return this.#palette.accent;
	}

	get popupActiveBackground() {
		return withAlpha(this.#palette.accent, 0.16);
	}

	get popupHoverBackground() {
		return withAlpha(this.#palette.foreground, 0.07);
	}

	get popupHoverText() {
		return this.#palette.foreground;
	}

	get danger() {
		return this.#palette.danger;
	}

	get dangerActive() {
		return this.#palette.ansi.brightRed;
	}

	get error() {
		return this.#palette.danger;
	}

	get warning() {
		return this.#palette.warning;
	}

	get success() {
		return this.#palette.success;
	}

	get notificationBadge() {
		return this.#palette.accent;
	}

	get glowPrimary() {
		return this.#palette.accent;
	}

	get glowSecondary() {
		return this.#palette.accent2;
	}

	get skyBg() {
		return this.#palette.background;
	}

	get accent() {
		return this.#palette.accent;
	}

	get accent2() {
		return this.#palette.accent2;
	}

	get textPrimary() {
		return this.#palette.foreground;
	}

	get textMuted() {
		return this.#palette.muted;
	}

	get cardSubtextOpacity() {
		return this.#palette.cardSubtextOpacity ?? super.cardSubtextOpacity;
	}

	get cardBg() {
		return this.#palette.surface;
	}

	get cardBorder() {
		return this.#palette.border;
	}

	get lineSoft() {
		return withAlpha(this.#palette.muted, 0.2);
	}

	get surfaceStrong() {
		return this.#palette.surfaceStrong;
	}

	get surfaceSoft() {
		return withAlpha(this.#palette.foreground, 0.06);
	}

	get scrollbarThumb() {
		return withAlpha(this.#palette.muted, 0.3);
	}

	get scrollbarThumbHover() {
		return withAlpha(this.#palette.accent, 0.42);
	}

	get scrollbarThumbActive() {
		return withAlpha(this.#palette.accent, 0.58);
	}

	get syntaxTheme() {
		return this.#palette.syntax;
	}

	get xtermTheme() {
		return {
			background: "transparent",
			foreground: this.#palette.foreground,
			cursor: this.#palette.accent,
			cursorAccent: this.#palette.background,
			selectionBackground: withAlpha(this.#palette.accent, 0.3),
			selectionInactiveBackground: withAlpha(this.#palette.muted, 0.2),
			scrollbarSliderBackground: this.scrollbarThumb,
			scrollbarSliderHoverBackground: this.scrollbarThumbHover,
			scrollbarSliderActiveBackground: this.scrollbarThumbActive,
			overviewRulerBorder: this.lineSoft,
			...this.#palette.ansi,
		};
	}
}

const oneDarkAnsi: AnsiPalette = {
	black: "#21252B",
	red: "#E06C75",
	green: "#98C379",
	yellow: "#E5C07B",
	blue: "#61AFEF",
	magenta: "#C678DD",
	cyan: "#56B6C2",
	white: "#ABB2BF",
	brightBlack: "#5C6370",
	brightRed: "#E06C75",
	brightGreen: "#98C379",
	brightYellow: "#E5C07B",
	brightBlue: "#61AFEF",
	brightMagenta: "#C678DD",
	brightCyan: "#56B6C2",
	brightWhite: "#FFFFFF",
};

export const oneDarkProTheme = new PopularTheme({
	name: "One Dark Pro",
	type: "dark",
	background: "#282C34",
	foreground: "#ABB2BF",
	surface: "#21252B",
	surfaceStrong: "#2C313A",
	muted: "#7F848E",
	border: "#3E4451",
	accent: "#61AFEF",
	accentForeground: "#21252B",
	accent2: "#C678DD",
	danger: "#E06C75",
	warning: "#E5C07B",
	success: "#98C379",
	info: "#61AFEF",
	ansi: oneDarkAnsi,
	syntax: {
		comment: "#5C6370",
		keyword: "#C678DD",
		string: "#98C379",
		number: "#D19A66",
		function: "#61AFEF",
		type: "#E5C07B",
		variable: "#ABB2BF",
		property: "#E06C75",
		tag: "#E06C75",
		regexp: "#56B6C2",
		operator: "#56B6C2",
		constant: "#D19A66",
	},
});

const draculaAnsi: AnsiPalette = {
	black: "#21222C",
	red: "#FF5555",
	green: "#50FA7B",
	yellow: "#F1FA8C",
	blue: "#8BE9FD",
	magenta: "#BD93F9",
	cyan: "#8BE9FD",
	white: "#F8F8F2",
	brightBlack: "#6272A4",
	brightRed: "#FF6E6E",
	brightGreen: "#69FF94",
	brightYellow: "#FFFFA5",
	brightBlue: "#D6ACFF",
	brightMagenta: "#FF92DF",
	brightCyan: "#A4FFFF",
	brightWhite: "#FFFFFF",
};

export const draculaTheme = new PopularTheme({
	name: "Dracula",
	type: "dark",
	background: "#282A36",
	foreground: "#F8F8F2",
	surface: "#21222C",
	surfaceStrong: "#44475A",
	muted: "#6272A4",
	secondaryText: "#B8BBD8",
	cardSubtextOpacity: "1",
	border: "#44475A",
	accent: "#BD93F9",
	accentForeground: "#282A36",
	accent2: "#FF79C6",
	danger: "#FF5555",
	warning: "#F1FA8C",
	success: "#50FA7B",
	info: "#8BE9FD",
	ansi: draculaAnsi,
	syntax: {
		comment: "#6272A4",
		keyword: "#FF79C6",
		string: "#F1FA8C",
		number: "#BD93F9",
		function: "#50FA7B",
		type: "#8BE9FD",
		variable: "#F8F8F2",
		property: "#8BE9FD",
		tag: "#FF79C6",
		regexp: "#FF5555",
		operator: "#FF79C6",
		constant: "#BD93F9",
	},
});

const githubDarkAnsi: AnsiPalette = {
	black: "#484F58",
	red: "#FF7B72",
	green: "#3FB950",
	yellow: "#D29922",
	blue: "#58A6FF",
	magenta: "#BC8CFF",
	cyan: "#39C5CF",
	white: "#B1BAC4",
	brightBlack: "#6E7681",
	brightRed: "#FFA198",
	brightGreen: "#56D364",
	brightYellow: "#E3B341",
	brightBlue: "#79C0FF",
	brightMagenta: "#D2A8FF",
	brightCyan: "#56D4DD",
	brightWhite: "#FFFFFF",
};

export const githubDarkTheme = new PopularTheme({
	name: "GitHub Dark",
	type: "dark",
	background: "#0D1117",
	foreground: "#E6EDF3",
	surface: "#161B22",
	surfaceStrong: "#21262D",
	muted: "#8B949E",
	border: "#30363D",
	accent: "#58A6FF",
	accentForeground: "#0D1117",
	accent2: "#BC8CFF",
	danger: "#F85149",
	warning: "#D29922",
	success: "#3FB950",
	info: "#58A6FF",
	ansi: githubDarkAnsi,
	syntax: {
		comment: "#8B949E",
		keyword: "#FF7B72",
		string: "#A5D6FF",
		number: "#79C0FF",
		function: "#D2A8FF",
		type: "#FFA657",
		variable: "#E6EDF3",
		property: "#E6EDF3",
		tag: "#7EE787",
		regexp: "#A5D6FF",
		operator: "#FF7B72",
		constant: "#79C0FF",
	},
});

const githubLightAnsi: AnsiPalette = {
	black: "#24292F",
	red: "#CF222E",
	green: "#1A7F37",
	yellow: "#9A6700",
	blue: "#0969DA",
	magenta: "#8250DF",
	cyan: "#1B7C83",
	white: "#6E7781",
	brightBlack: "#57606A",
	brightRed: "#A40E26",
	brightGreen: "#116329",
	brightYellow: "#7D4E00",
	brightBlue: "#0550AE",
	brightMagenta: "#6639BA",
	brightCyan: "#0A626A",
	brightWhite: "#1F2328",
};

export const githubLightTheme = new PopularTheme({
	name: "GitHub Light",
	type: "light",
	background: "#FFFFFF",
	foreground: "#1F2328",
	surface: "#F6F8FA",
	surfaceStrong: "#EAEEF2",
	muted: "#656D76",
	border: "#D0D7DE",
	accent: "#0969DA",
	accentForeground: "#FFFFFF",
	accent2: "#8250DF",
	danger: "#CF222E",
	warning: "#9A6700",
	success: "#1A7F37",
	info: "#0969DA",
	ansi: githubLightAnsi,
	syntax: {
		comment: "#6E7781",
		keyword: "#CF222E",
		string: "#0A3069",
		number: "#0550AE",
		function: "#8250DF",
		type: "#953800",
		variable: "#1F2328",
		property: "#1F2328",
		tag: "#116329",
		regexp: "#0A3069",
		operator: "#CF222E",
		constant: "#0550AE",
	},
});

const tokyoNightAnsi: AnsiPalette = {
	black: "#15161E",
	red: "#F7768E",
	green: "#9ECE6A",
	yellow: "#E0AF68",
	blue: "#7AA2F7",
	magenta: "#BB9AF7",
	cyan: "#7DCFFF",
	white: "#A9B1D6",
	brightBlack: "#414868",
	brightRed: "#F7768E",
	brightGreen: "#9ECE6A",
	brightYellow: "#E0AF68",
	brightBlue: "#7AA2F7",
	brightMagenta: "#BB9AF7",
	brightCyan: "#7DCFFF",
	brightWhite: "#C0CAF5",
};

export const tokyoNightTheme = new PopularTheme({
	name: "Tokyo Night",
	type: "dark",
	background: "#1A1B26",
	foreground: "#C0CAF5",
	surface: "#16161E",
	surfaceStrong: "#24283B",
	muted: "#565F89",
	border: "#3B4261",
	accent: "#7AA2F7",
	accentForeground: "#16161E",
	accent2: "#BB9AF7",
	danger: "#F7768E",
	warning: "#E0AF68",
	success: "#9ECE6A",
	info: "#7DCFFF",
	ansi: tokyoNightAnsi,
	syntax: {
		comment: "#565F89",
		keyword: "#BB9AF7",
		string: "#9ECE6A",
		number: "#FF9E64",
		function: "#7AA2F7",
		type: "#7DCFFF",
		variable: "#C0CAF5",
		property: "#7DCFFF",
		tag: "#F7768E",
		regexp: "#B4F9F8",
		operator: "#89DDFF",
		constant: "#FF9E64",
	},
});

const catppuccinAnsi: AnsiPalette = {
	black: "#45475A",
	red: "#F38BA8",
	green: "#A6E3A1",
	yellow: "#F9E2AF",
	blue: "#89B4FA",
	magenta: "#F5C2E7",
	cyan: "#94E2D5",
	white: "#BAC2DE",
	brightBlack: "#585B70",
	brightRed: "#F38BA8",
	brightGreen: "#A6E3A1",
	brightYellow: "#F9E2AF",
	brightBlue: "#89B4FA",
	brightMagenta: "#F5C2E7",
	brightCyan: "#94E2D5",
	brightWhite: "#A6ADC8",
};

export const catppuccinMochaTheme = new PopularTheme({
	name: "Catppuccin Mocha",
	type: "dark",
	background: "#1E1E2E",
	foreground: "#CDD6F4",
	surface: "#181825",
	surfaceStrong: "#313244",
	muted: "#6C7086",
	border: "#45475A",
	accent: "#CBA6F7",
	accentForeground: "#1E1E2E",
	accent2: "#F5C2E7",
	danger: "#F38BA8",
	warning: "#F9E2AF",
	success: "#A6E3A1",
	info: "#89B4FA",
	ansi: catppuccinAnsi,
	syntax: {
		comment: "#6C7086",
		keyword: "#CBA6F7",
		string: "#A6E3A1",
		number: "#FAB387",
		function: "#89B4FA",
		type: "#F9E2AF",
		variable: "#CDD6F4",
		property: "#89B4FA",
		tag: "#F38BA8",
		regexp: "#94E2D5",
		operator: "#89DCEB",
		constant: "#FAB387",
	},
});
