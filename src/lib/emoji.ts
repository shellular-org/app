// Force text-style (monochrome) rendering of emoji on all platforms including
// iOS by stripping any existing emoji variation selector (U+FE0F) and appending
// the text variation selector (U+FE0E) after every pictographic character.
const PICTOGRAPHIC_RE = /(\p{Extended_Pictographic})\uFE0F?/gu;

export function textifyEmoji(str: string): string {
	return str.replace(PICTOGRAPHIC_RE, "$1\uFE0E");
}
