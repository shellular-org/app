import type { ITheme } from "@xterm/xterm";
import color from "classes/color";
import { isValidColor } from "./color/regex";

export default class Theme {
	static WHITE = "#ffffff";
	static BLACK = "#000000";

	#name: string;
	#type: string;

	#primary = "#213555";
	#primaryText = Theme.WHITE;
	#secondary = "#3E5879";
	#secondaryText = "#F5EFE7";

	constructor(
		name: string,
		type: string,
		primary?: string,
		primaryText?: string,
		secondary?: string,
		secondaryText?: string,
	) {
		this.#name = name;
		this.#type = type;

		if (primary) {
			this.#primary = primary;
		}

		if (primaryText) {
			this.#primaryText = primaryText;
		}

		if (secondary) {
			this.#secondary = secondary;
		}

		if (secondaryText) {
			this.#secondaryText = secondaryText;
		}
	}

	get name() {
		return this.#name;
	}

	get type() {
		return this.#type;
	}

	get primary() {
		return this.#primary;
	}

	get primaryText() {
		return this.#primaryText;
	}

	get primaryActiveText() {
		return "#3399ff";
	}

	get secondary() {
		return this.#secondary;
	}

	get secondaryText() {
		return this.#secondaryText;
	}

	get link() {
		return "#3399ff";
	}

	get borderRadius() {
		return "4px";
	}

	get borderColor() {
		return "#666666";
	}

	get shadowColor() {
		return "rgba(0, 0, 0, 0.5)";
	}

	get shadow() {
		return `0 0 4px 0 ${this.shadowColor}`;
	}

	get border() {
		return `solid 1px ${this.borderColor}`;
	}

	get placeholder() {
		return "#cccccc";
	}

	get placeholderActive() {
		return "#999999";
	}

	get buttonText() {
		return Theme.WHITE;
	}

	get buttonBackground() {
		return "#43368a";
	}

	get buttonBackgroundActive() {
		return "#2c235e";
	}

	get popupIcon() {
		return Theme.WHITE;
	}

	get popupText() {
		return Theme.WHITE;
	}

	get popupActiveBackground() {
		return this.secondary;
	}

	get popupBackground() {
		return "#162a4a";
	}

	get popupActiveText() {
		return "#ffd700";
	}

	get popupHoverBackground() {
		return "rgba(0, 0, 0, 0.5)";
	}

	get popupHoverText() {
		return Theme.WHITE;
	}

	get popupBackdropFilter() {
		return "blur(10px)";
	}

	get popupBorderColor() {
		return "#666666";
	}

	get popupBorder() {
		return `solid 1px ${this.popupBorderColor}`;
	}

	get dangerText() {
		return Theme.WHITE;
	}

	get info() {
		return "#3399ff";
	}

	get danger() {
		return "#ff3325";
	}

	get dangerActive() {
		return "#661105";
	}

	get dangerBorder() {
		return "solid 1px var(--danger)";
	}

	get dangerBackground() {
		return `linear-gradient(to bottom, ${this.dangerActive}, ${this.danger})`;
	}

	get successText() {
		return Theme.WHITE;
	}

	get error() {
		return "#ff9966";
	}

	get warning() {
		return "#ff9966";
	}

	get success() {
		return "#339966";
	}

	get input() {
		return this.primary;
	}

	get inputLabel() {
		return this.primary;
	}

	get inputText() {
		return this.primaryText;
	}

	get inputPlaceholder() {
		return this.secondaryText;
	}

	get inputBorder() {
		return `solid 1px ${this.inputText}`;
	}

	get inputLabelText() {
		return this.secondaryText;
	}

	get notificationBadge() {
		return "rgb(183, 255, 0)";
	}

	get glowPrimary() {
		return this.primaryText;
	}

	get glowSecondary() {
		return color(this.primaryText).lighten(1).hex.toString();
	}

	get glowDangerPrimary() {
		return this.danger;
	}

	get glowDangerSecondary() {
		return color(this.danger).lighten(0.2).hex.toString();
	}

	get skyBg() {
		return this.primary;
	}

	get accent() {
		return this.link;
	}

	get accent2() {
		return this.secondary;
	}

	get textPrimary() {
		return this.primaryText;
	}

	get textMuted() {
		return this.secondaryText;
	}

	get cardBg() {
		return this.secondary;
	}

	get cardBorder() {
		return this.borderColor;
	}

	get lineSoft() {
		return "rgba(0, 0, 0, 0.1)";
	}

	get surfaceStrong() {
		return this.secondary;
	}

	get surfaceSoft() {
		return "rgba(0, 0, 0, 0.05)";
	}

	get scrollbarTrack() {
		return "transparent";
	}

	get scrollbarThumb() {
		return "rgba(255, 255, 255, 0.14)";
	}

	get scrollbarThumbHover() {
		return "rgba(255, 255, 255, 0.24)";
	}

	get scrollbarThumbActive() {
		return "rgba(255, 255, 255, 0.34)";
	}

	get json() {
		const json: Record<string, string> = {};
		const prototype = Object.getPrototypeOf(Object.getPrototypeOf(this));
		const props = Object.entries(Object.getOwnPropertyDescriptors(prototype));
		const getters = props.filter(([, { get }]) => typeof get === "function");

		for (const [key] of getters) {
			if (["css", "json"].includes(key)) {
				continue;
			}

			if (key === "xtermTheme") {
				for (const [xKey, xValue] of Object.entries(this.xtermTheme)) {
					const cssVar = `xterm-${xKey.replace(/[A-Z]/g, ($) => `-${$.toLowerCase()}`)}`;
					json[cssVar] = xValue;
				}
				continue;
			}

			const value = Reflect.get(this, key);

			if (key === "name" || key === "type") {
				json[key] = String(value);
				continue;
			}

			if (isValidColor(String(value))) {
				json[key] = color(String(value)).hex.toString();
			} else {
				json[key] = String(value);
			}
		}

		return json;
	}

	get css() {
		let css = "";
		const { json } = this;
		for (const [key, value] of Object.entries(json)) {
			const cssVar = key.replace(/[A-Z]/g, ($) => `-${$.toLowerCase()}`);
			css += `--${cssVar}: ${value};\n`;
		}
		return `:root {\n${css}}\n`;
	}

	get popupBackgroundOpaque() {
		const background = color(this.popupBackground).rgb;
		return background.toString();
	}

	get circularProgressBarTrack0() {
		return "orange";
	}

	get circularProgressBarTrack1() {
		return "lime";
	}

	get circularProgressBarTrack2() {
		return "aqua";
	}

	get xtermTheme(): ITheme {
		return {
			background: "transparent",
			foreground: this.primaryText,
			cursor: this.link,
			cursorAccent: this.primary,
			selectionBackground: "rgba(255, 255, 255, 0.18)",
			selectionInactiveBackground: "rgba(255, 255, 255, 0.12)",
			scrollbarSliderBackground: this.scrollbarThumb,
			scrollbarSliderHoverBackground: this.scrollbarThumbHover,
			scrollbarSliderActiveBackground: this.scrollbarThumbActive,
			overviewRulerBorder: this.lineSoft,
		};
	}
}
