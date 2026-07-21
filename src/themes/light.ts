import Theme from "classes/theme";

export default new (class extends Theme {
	constructor() {
		// primary = grouped bg, primaryText = label, secondary = card/cell bg, secondaryText = secondary label
		super("Light", "light", "#f2f2f7", "#000000", "#ffffff", "#3c3c43");
	}

	get link() {
		return "#5856d6";
	}

	get info() {
		return "#5856d6";
	}

	get primaryActiveText() {
		return "#5856d6";
	}

	get buttonBackground() {
		return "#5856d6";
	}

	get buttonText() {
		return "#ffffff";
	}

	get buttonBackgroundActive() {
		return "#3d3ab8";
	}

	get placeholder() {
		return "rgba(60, 60, 67, 0.06)";
	}

	get popupText() {
		return "#000000";
	}

	get popupBackground() {
		return "#ffffff";
	}

	get popupActiveBackground() {
		return "rgba(88, 86, 214, 0.1)";
	}

	get popupHoverBackground() {
		return "rgba(88, 86, 214, 0.06)";
	}

	get popupHoverText() {
		return "#000000";
	}

	get popupIcon() {
		return "#5856d6";
	}

	get popupActiveText() {
		return "#5856d6";
	}

	get popupBorderColor() {
		return "rgba(60, 60, 67, 0.18)";
	}

	get dangerText() {
		return "#ffffff";
	}

	get danger() {
		return "#ff3b30";
	}

	get dangerActive() {
		return "#c62b22";
	}

	get error() {
		return "#ff3b30";
	}

	get success() {
		return "#34c759";
	}

	get inputText() {
		return "#000000";
	}

	get inputPlaceholder() {
		return "rgba(60, 60, 67, 0.4)";
	}

	get notificationBadge() {
		return "#5856d6";
	}

	get shadowColor() {
		return "rgba(0, 0, 0, 0.1)";
	}

	get glowPrimary() {
		return "#5856d6";
	}

	get glowSecondary() {
		return "#5856d6";
	}

	get glowDangerPrimary() {
		return "#ff3b30";
	}

	get glowDangerSecondary() {
		return "#c62b22";
	}

	// ── New palette vars ──────────────────────────────────────────
	get skyBg() {
		return "#f2f2f7";
	}

	get accent() {
		return "#5856d6";
	}

	get accent2() {
		return "#3d3ab8";
	}

	get textPrimary() {
		return "#000000";
	}

	get textMuted() {
		return "rgba(60, 60, 67, 0.6)";
	}

	get cardBg() {
		return "rgba(255, 255, 255, 0.9)";
	}

	get borderColor() {
		return "rgba(60, 60, 67, 0.18)";
	}

	get cardBorder() {
		return "rgba(60, 60, 67, 0.18)";
	}

	get lineSoft() {
		return "rgba(60, 60, 67, 0.1)";
	}

	get surfaceStrong() {
		return "rgba(255, 255, 255, 0.95)";
	}

	get surfaceSoft() {
		return "rgba(60, 60, 67, 0.06)";
	}

	get scrollbarThumb() {
		return "rgba(60, 60, 67, 0.18)";
	}

	get scrollbarThumbHover() {
		return "rgba(88, 86, 214, 0.3)";
	}

	get scrollbarThumbActive() {
		return "rgba(88, 86, 214, 0.42)";
	}

	get xtermTheme() {
		return {
			background: "transparent",
			foreground: "#1C1C1E",
			cursor: "#5856D6",
			cursorAccent: "#FFFFFF",
			selectionBackground: "rgba(88, 86, 214, 0.24)",
			selectionInactiveBackground: "rgba(60, 60, 67, 0.12)",
			scrollbarSliderBackground: this.scrollbarThumb,
			scrollbarSliderHoverBackground: this.scrollbarThumbHover,
			scrollbarSliderActiveBackground: this.scrollbarThumbActive,
			overviewRulerBorder: this.lineSoft,
			black: "#E5E5EA",
			red: "#FF3B30",
			green: "#34C759",
			yellow: "#FF9500",
			blue: "#007AFF",
			magenta: "#AF52DE",
			cyan: "#5856D6",
			white: "#3A3A3C",
			brightBlack: "#8E8E93",
			brightRed: "#FF6961",
			brightGreen: "#5ECA7A",
			brightYellow: "#FFB340",
			brightBlue: "#409CFF",
			brightMagenta: "#DA8FFF",
			brightCyan: "#7674E8",
			brightWhite: "#1C1C1E",
		};
	}
})();
