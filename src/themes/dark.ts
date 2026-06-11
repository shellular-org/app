import Theme from "classes/theme";

const darkTheme = new (class extends Theme {
	constructor() {
		super("Dark", "dark", "#0d0d0f", "#f5f1e8", "#1b1b1f", "#ded6c8");
	}

	get link() {
		return "#0095ff";
	}

	get info() {
		return "#d6c2a1";
	}

	get primaryActiveText() {
		return "#d6c2a1";
	}

	get borderColor() {
		return "rgba(214, 194, 161, 0.14)";
	}

	get shadowColor() {
		return "rgba(0, 0, 0, 0.6)";
	}

	get placeholder() {
		return "rgba(24, 24, 27, 0.74)";
	}

	get inputPlaceholder() {
		return "rgba(222, 214, 200, 0.4)";
	}

	get buttonBackground() {
		return "#d6c2a1";
	}

	get buttonText() {
		return "#0d0d0f";
	}

	get buttonBackgroundActive() {
		return "#8a745c";
	}

	get popupBackground() {
		return "#18181b";
	}

	get popupBorderColor() {
		return "#d6c2a124";
	}

	get popupActiveText() {
		return "#d6c2a1";
	}

	get popupActiveBackground() {
		return "#d6c2a11a";
	}

	get success() {
		return "#91c58a";
	}

	get skyBg() {
		return "#0d0d0f";
	}

	get accent() {
		return "#d6c2a1";
	}

	get accent2() {
		return "#8a745c";
	}

	get textPrimary() {
		return "#f5f1e8";
	}

	get textMuted() {
		return "rgba(222, 214, 200, 0.66)";
	}

	get cardBg() {
		return "rgba(24, 24, 27, 0.74)";
	}

	get cardBorder() {
		return "rgba(214, 194, 161, 0.14)";
	}

	get lineSoft() {
		return "rgba(214, 194, 161, 0.1)";
	}

	get surfaceStrong() {
		return "rgba(27, 27, 31, 0.9)";
	}

	get surfaceSoft() {
		return "rgba(245, 241, 232, 0.05)";
	}

	get xtermTheme() {
		return {
			background: "transparent",
			foreground: "#F5F1E8",
			cursor: "#D6C2A1",
			cursorAccent: "#0D0D0F",
			selectionBackground: "rgba(214, 194, 161, 0.28)",
			selectionInactiveBackground: "rgba(222, 214, 200, 0.14)",
			scrollbarSliderBackground: "rgba(222, 214, 200, 0.14)",
			scrollbarSliderHoverBackground: "rgba(214, 194, 161, 0.22)",
			scrollbarSliderActiveBackground: "rgba(214, 194, 161, 0.32)",
			black: "#1B1B1F",
			red: "#C96B5C",
			green: "#91C58A",
			yellow: "#D6C2A1",
			blue: "#A7C1D9",
			magenta: "#8A745C",
			cyan: "#8FB7B3",
			white: "#DED6C8",
			brightBlack: "#8B8378",
			brightRed: "#E08A7C",
			brightGreen: "#B1D8AB",
			brightYellow: "#E8D8BC",
			brightBlue: "#C5D8E8",
			brightMagenta: "#B29679",
			brightCyan: "#A8D1CB",
			brightWhite: "#FFF9F0",
		};
	}
})();

export default darkTheme;
