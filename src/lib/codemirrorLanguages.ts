import {
	LanguageDescription,
	type LanguageSupport,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";

const loadCache = new WeakMap<
	LanguageDescription,
	Promise<LanguageSupport | null>
>();

const languageAliases = new Map<string, string>([
	["cjs", "javascript"],
	["cts", "typescript"],
	["jsonc", "json"],
	["mjs", "javascript"],
	["mts", "typescript"],
	["py", "python"],
	["rs", "rust"],
]);

function normalizeLanguageName(languageName: string): string {
	const trimmed = languageName.trim();
	if (!trimmed) return "";

	// Markdown info strings often look like "ts title=..." or "{.rust}".
	const firstToken = trimmed
		.replace(/^\{\s*\.?/, "")
		.replace(/\s*\}$/, "")
		.split(/[\s,;:]+/, 1)[0]
		.replace(/^\./, "")
		.toLowerCase();

	return languageAliases.get(firstToken) ?? firstToken;
}

function findLanguageByName(languageName: string): LanguageDescription | null {
	const normalized = normalizeLanguageName(languageName);
	if (!normalized) return null;

	return (
		LanguageDescription.matchLanguageName(languages, normalized, true) ??
		LanguageDescription.matchFilename(languages, `file.${normalized}`)
	);
}

function loadLanguageDescription(
	description: LanguageDescription | null,
): Promise<LanguageSupport | null> {
	if (!description) return Promise.resolve(null);
	if (description.support) return Promise.resolve(description.support);

	const cached = loadCache.get(description);
	if (cached) return cached;

	const loading = description.load().catch(() => null);
	loadCache.set(description, loading);
	return loading;
}

export function getLoadedLanguageSupportForName(
	languageName: string,
): LanguageSupport | null {
	return findLanguageByName(languageName)?.support ?? null;
}

export function loadLanguageForName(
	languageName: string,
): Promise<LanguageSupport | null> {
	return loadLanguageDescription(findLanguageByName(languageName));
}

export function loadLanguageForFilename(
	filePath: string,
): Promise<LanguageSupport | null> {
	return loadLanguageDescription(
		LanguageDescription.matchFilename(languages, filePath),
	);
}
