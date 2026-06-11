import { classHighlighter, highlightTree } from "@lezer/highlight";
import {
	getLoadedLanguageSupportForName,
	loadLanguageForName,
} from "lib/codemirrorLanguages";
import { escapeHtml } from "./utils";

const CACHE_MAX = 100;
const hlCache = new Map<string, string>();

function getParser(lang: string) {
	return getLoadedLanguageSupportForName(lang)?.language.parser ?? null;
}

/**
 * Returns highlighted HTML for a code block. Spans use `tok-*` class names
 * from @lezer/highlight's classHighlighter (e.g. tok-keyword, tok-string).
 * Falls back to plain escaped text for unsupported languages.
 */
export function highlightCodeBlock(code: string, lang: string): string {
	const cacheKey = `${lang}\0${code}`;
	const cached = hlCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const parser = getParser(lang);
	let result: string;

	if (!parser) {
		if (lang.trim()) void loadLanguageForName(lang);
		result = escapeHtml(code);
	} else {
		try {
			const tree = parser.parse(code);
			const chunks: string[] = [];
			let pos = 0;

			highlightTree(tree, classHighlighter, (from, to, classes) => {
				if (from > pos) {
					chunks.push(escapeHtml(code.slice(pos, from)));
				}
				chunks.push(
					`<span class="${classes}">${escapeHtml(code.slice(from, to))}</span>`,
				);
				pos = to;
			});

			if (pos < code.length) {
				chunks.push(escapeHtml(code.slice(pos)));
			}

			result = chunks.join("");
		} catch {
			result = escapeHtml(code);
		}
	}

	if (parser && hlCache.size >= CACHE_MAX) {
		const first = hlCache.keys().next().value;
		if (first !== undefined) hlCache.delete(first);
	}
	if (parser) hlCache.set(cacheKey, result);
	return result;
}

export async function preloadCodeBlockLanguages(
	languageNames: Iterable<string>,
): Promise<boolean> {
	const names = [...new Set([...languageNames].filter((name) => name.trim()))];
	const beforeCount = names.filter((name) => getParser(name)).length;

	await Promise.all(names.map((name) => loadLanguageForName(name)));

	const afterCount = names.filter((name) => getParser(name)).length;
	return afterCount > 0 && afterCount >= beforeCount;
}
