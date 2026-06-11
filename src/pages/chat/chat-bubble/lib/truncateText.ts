import DOMPurify from "dompurify";

const DEFAULT_MAX_CHARS = 500;

const VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

function parseTag(fullTag: string): {
	type: "open" | "close" | "self-close";
	name: string;
} | null {
	const matchClose = fullTag.match(/^<\/(\w+)/);
	if (matchClose) {
		return { type: "close", name: matchClose[1].toLowerCase() };
	}

	if (/\/\s*>$/.test(fullTag)) {
		const matchSelf = fullTag.match(/^<(\w+)/);
		if (matchSelf) {
			return { type: "self-close", name: matchSelf[1].toLowerCase() };
		}
		return null;
	}

	const matchOpen = fullTag.match(/^<(\w+)/);
	if (matchOpen) {
		const name = matchOpen[1].toLowerCase();
		if (VOID_ELEMENTS.has(name)) {
			return { type: "self-close", name };
		}
		return { type: "open", name };
	}

	return null;
}

export function truncateHtmlAtTextBoundary(
	html: string,
	maxChars: number = DEFAULT_MAX_CHARS,
): string {
	const tagStack: string[] = [];
	let textCount = 0;
	let result = "";
	let i = 0;
	let truncated = false;

	while (i < html.length) {
		const ch = html[i];

		if (ch === "<") {
			const tagEnd = html.indexOf(">", i);
			if (tagEnd === -1) {
				result += html.slice(i);
				break;
			}
			const fullTag = html.slice(i, tagEnd + 1);
			const parsed = parseTag(fullTag);

			if (parsed) {
				if (parsed.type === "open") {
					tagStack.push(parsed.name);
				} else if (parsed.type === "close") {
					for (let j = tagStack.length - 1; j >= 0; j -= 1) {
						if (tagStack[j] === parsed.name) {
							tagStack.splice(j, 1);
							break;
						}
					}
				}
			}

			result += fullTag;
			i = tagEnd + 1;
			continue;
		}

		if (ch === "&") {
			const entityEnd = html.indexOf(";", i);
			if (entityEnd !== -1 && entityEnd - i <= 12) {
				result += html.slice(i, entityEnd + 1);
				textCount += 1;
				i = entityEnd + 1;
			} else {
				result += ch;
				textCount += 1;
				i += 1;
			}
		} else {
			if (textCount >= maxChars) {
				truncated = true;
				break;
			}
			result += ch;
			textCount += 1;
			i += 1;
		}
	}

	if (truncated) {
		for (let j = tagStack.length - 1; j >= 0; j -= 1) {
			result += `</${tagStack[j]}>`;
		}
		result += "…";
	}

	return DOMPurify.sanitize(result, {
		ADD_ATTR: ["data-lang", "data-path", "data-kind"],
	});
}
