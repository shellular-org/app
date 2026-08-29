const HEX_COLOR = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_COLOR =
	/^rgba?\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)))?\s*\)$/i;

function hexByte(value: number) {
	return Math.round(Math.min(255, Math.max(0, value)))
		.toString(16)
		.padStart(2, "0")
		.toUpperCase();
}

function parseMonacoColor(value: string): string | null {
	const input = value.trim();
	if (input.toLowerCase() === "transparent") return "#00000000";

	const hex = input.match(HEX_COLOR)?.[1];
	if (hex) {
		const expanded =
			hex.length <= 4
				? [...hex].map((character) => `${character}${character}`).join("")
				: hex;
		return `#${expanded.toUpperCase()}`;
	}

	const rgb = input.match(RGB_COLOR);
	if (!rgb) return null;
	const color = `#${hexByte(Number(rgb[1]))}${hexByte(Number(rgb[2]))}${hexByte(Number(rgb[3]))}`;
	if (rgb[4] === undefined) return color;
	return `${color}${hexByte(Number(rgb[4]) * 255)}`;
}

export function normalizeMonacoColor(
	value: string | undefined,
	fallback = "#000000",
) {
	return (
		(value ? parseMonacoColor(value) : null) ??
		parseMonacoColor(fallback) ??
		"#000000"
	);
}

export function withColorAlpha(
	value: string | undefined,
	alpha: number,
	fallback = "#000000",
) {
	return `${normalizeMonacoColor(value, fallback).slice(0, 7)}${hexByte(alpha * 255)}`;
}

export const withMonacoAlpha = withColorAlpha;

export function monacoTokenColor(value: string | undefined, fallback?: string) {
	return normalizeMonacoColor(value, fallback).slice(1, 7);
}
