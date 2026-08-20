const ELLIPSIS = "…";

/**
 * Measured, not guessed: the narrowest column a path row gets is the settled
 * fold's rail at 390px, 281 CSS px wide, and the mono face advances 7.2px per
 * character there. Anything longer is clipped again by `text-overflow`, at the
 * tail, which throws away the basename this whole helper exists to keep.
 */
const PATH_MAX_CHARS = 36;
const COMMAND_MAX_CHARS = 38;

/**
 * Shorten a path so the basename survives. The basename is the only part that
 * distinguishes one row from its neighbours, so the middle of the directory
 * goes first and the tail is never cut. The VS Code extension does the same
 * thing more bluntly, rendering only `file_path.split("/").pop()`.
 *
 * Callers must pass the original string as `aria-label`: this shortens before
 * render, so the full value leaves the DOM and a screen reader would otherwise
 * hear the shortened path too.
 */
export function elidePath(path: string, maxChars = PATH_MAX_CHARS): string {
	const clean = path.replace(/\/+$/, "");
	if (clean.length <= maxChars) return clean;
	// Carbon: an ellipsis should stand for three or more characters, otherwise
	// it costs more attention than it saves.
	if (clean.length - maxChars < 3) return clean;

	const segments = clean.split("/");
	const base = segments.pop() ?? clean;
	if (base.length + 2 > maxChars) {
		// Carbon and PatternFly: never leave fewer than four real characters.
		const keep = Math.max(4, maxChars - 1);
		return `${ELLIPSIS}${base.slice(base.length - keep)}`;
	}

	// Grow back from the tail: the directories nearest the file carry the most
	// context, and the repository root is the least useful thing on a phone.
	let tail = base;
	for (let index = segments.length - 1; index >= 0; index -= 1) {
		const candidate = `${segments[index]}/${tail}`;
		if (candidate.length + 2 > maxChars) break;
		tail = candidate;
	}
	return `${ELLIPSIS}/${tail}`;
}

/** Keep the head of a command: the binary and its first arguments identify it. */
export function elideCommand(
	command: string,
	maxChars = COMMAND_MAX_CHARS,
): string {
	const line = command.split(/\r?\n/, 1)[0]?.trim() ?? "";
	if (line.length <= maxChars) return line;
	return `${line.slice(0, maxChars - 1)}${ELLIPSIS}`;
}
