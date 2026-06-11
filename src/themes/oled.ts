import Theme from "classes/theme";

const oldTheme = new (class extends Theme {
	constructor() {
		super("OLED", "dark", Theme.BLACK, "#faf0e6", "#101010", "#f0f0f0");
	}

	get buttonBackground() {
		return "#0095ff";
	}

	get buttonText() {
		return "#ffffff";
	}

	get buttonBackgroundActive() {
		return "#007acc";
	}

	get popupBackground() {
		return "#121212";
	}

	get popupActiveText() {
		return "#0095ff";
	}

	get link() {
		return "#d6c2a1";
	}

	get popupBorder() {
		return `solid 1px ${this.popupBorderColor}`;
	}

	get popupActiveBackground() {
		return this.secondary;
	}

	get placeholder() {
		return "#333333";
	}

	get danger() {
		return "#ff3325";
	}

	get dangerActive() {
		return "#661105";
	}

	get dangerBorder() {
		return `solid 1px ${this.danger}`;
	}

	get error() {
		return "#ff9966";
	}

	get success() {
		return "#339966";
	}

	get shadow() {
		return "none";
	}

	get borderRadius() {
		return "6px";
	}

	get inputPlaceholder() {
		return "#999999";
	}

	get popupBorderColor() {
		return "rgba(0, 149, 255, 0.35)";
	}

	get borderColor() {
		return "rgba(42, 50, 123, 0.12)";
	}

	get shadowColor() {
		return "rgba(0, 0, 0, 0.15)";
	}

	get info() {
		return "#0095ff";
	}

	get accent() {
		return "#0095ff";
	}

	get accent2() {
		return "#2455bf";
	}

	get textMuted() {
		return "rgba(240, 240, 240, 0.5)";
	}

	get cardBg() {
		return "rgba(255, 255, 255, 0.04)";
	}

	get cardBorder() {
		return "rgba(0, 149, 255, 0.16)";
	}

	get lineSoft() {
		return "rgba(255, 255, 255, 0.07)";
	}

	get surfaceStrong() {
		return "rgba(16, 16, 16, 0.94)";
	}

	get surfaceSoft() {
		return "rgba(255, 255, 255, 0.03)";
	}

	get xtermTheme() {
		return {
			background: "transparent",
			foreground: "#FAF0E6",
			cursor: "#0095ff",
			cursorAccent: "#000000",
			selectionBackground: "rgba(0, 149, 255, 0.25)",
			selectionInactiveBackground: "rgba(240, 240, 240, 0.12)",
			scrollbarSliderBackground: "rgba(240, 240, 240, 0.12)",
			scrollbarSliderHoverBackground: "rgba(0, 149, 255, 0.2)",
			scrollbarSliderActiveBackground: "rgba(0, 149, 255, 0.32)",
			black: "#101010",
			red: "#D95C4F",
			green: "#339966",
			yellow: "#0095ff",
			blue: "#7AA2F7",
			magenta: "#6C4C9C",
			cyan: "#4DB6AC",
			white: "#F0F0F0",
			brightBlack: "#7A7A7A",
			brightRed: "#F07C6E",
			brightGreen: "#57B984",
			brightYellow: "#4db8ff",
			brightBlue: "#9BB9FF",
			brightMagenta: "#8B68C1",
			brightCyan: "#73D4CB",
			brightWhite: "#FFF8EF",
		};
	}
})();

export default oldTheme;
