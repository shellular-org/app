import DOMPurify from "dompurify";
import { getFileIcon } from "lib/fileIcon";
import type { Tokens } from "marked";
import { marked } from "marked";
import { highlightCodeBlock } from "./codeHighlight";
import { escapeHtml } from "./utils";

const MD_CACHE_MAX = 200;
const mdCache = new Map<string, string>();

type ReferenceKind = "web" | "file" | "plain";
type ReferenceRenderMode = "rich" | "plain" | "file-pills";
type InlineMarkdownOptions = {
	referenceMode?: ReferenceRenderMode;
};

let referenceRenderMode: ReferenceRenderMode = "rich";

marked.use({
	breaks: true,
	renderer: {
		code({ text, lang }: Tokens.Code): string {
			if (!text.trim()) return "";
			const highlighted = highlightCodeBlock(text, lang ?? "");
			const safeLang = lang ? lang.replace(/[^\w-]/g, "").slice(0, 32) : "";
			const langAttr = safeLang ? ` data-lang="${safeLang}"` : "";
			return `<pre${langAttr}><code>${highlighted}</code></pre>\n`;
		},
		link: renderMarkdownLink,
	},
});

export function renderMarkdown(text: string, highlightVersion: number): string {
	const cacheKey = `${highlightVersion}\0${text}`;
	const cached = mdCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const html = sanitizeMarkdown(marked(text, { async: false }));
	if (mdCache.size >= MD_CACHE_MAX) {
		const first = mdCache.keys().next().value;
		if (first !== undefined) mdCache.delete(first);
	}
	mdCache.set(cacheKey, html);
	return html;
}

export function renderInlineMarkdown(
	text: string,
	options: InlineMarkdownOptions = {},
): string {
	const previousReferenceRenderMode = referenceRenderMode;
	referenceRenderMode = options.referenceMode ?? "rich";
	try {
		return sanitizeMarkdown(marked.parseInline(text, { async: false }));
	} finally {
		referenceRenderMode = previousReferenceRenderMode;
	}
}

export function collectMarkdownCodeLanguages(text: string): string[] {
	const languages = new Set<string>();
	const visit = (value: unknown) => {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			value.forEach(visit);
			return;
		}

		const token = value as { type?: string; lang?: string };
		if (token.type === "code" && token.lang) languages.add(token.lang);

		for (const child of Object.values(value)) {
			if (Array.isArray(child)) visit(child);
		}
	};

	try {
		visit(marked.lexer(text));
		return [...languages];
	} catch {
		return [];
	}
}

function sanitizeMarkdown(html: string): string {
	return DOMPurify.sanitize(html, {
		ADD_ATTR: ["data-lang", "data-path", "data-kind"],
	});
}

function renderMarkdownLink({ href, text, title }: Tokens.Link): string {
	const label = escapeHtml(text || href);
	const safeHref = escapeHtml(href);
	const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
	if (referenceRenderMode === "plain") {
		return `<a href="${safeHref}"${titleAttr}>${label}</a>`;
	}

	const kind = classifyReferenceHref(href);

	if (referenceRenderMode === "file-pills") {
		if (kind !== "file") {
			return `<a href="${safeHref}"${titleAttr}>${label}</a>`;
		}

		const icon = getFileIcon(fileNameFromHref(href));
		return [
			`<span class="file-reference" data-path="${safeHref}"${titleAttr}>`,
			`<span class="${icon}" aria-hidden="true"></span>`,
			`<span>${label}</span>`,
			"</span>",
		].join("");
	}

	if (kind === "web") {
		return [
			`<a class="markdown-reference markdown-reference--web" href="${safeHref}"${titleAttr} target="_blank" rel="noreferrer">`,
			'<span class="icon-globe" aria-hidden="true"></span>',
			`<span>${label}</span>`,
			"</a>",
		].join("");
	}

	if (kind === "file") {
		const icon = getFileIcon(fileNameFromHref(href));
		return [
			`<a class="markdown-reference markdown-reference--file" href="${safeHref}"${titleAttr} data-path="${safeHref}">`,
			`<span class="${icon}" aria-hidden="true"></span>`,
			`<span>${label}</span>`,
			"</a>",
		].join("");
	}

	return `<a href="${safeHref}"${titleAttr}>${label}</a>`;
}

function classifyReferenceHref(href: string): ReferenceKind {
	if (/^https?:\/\//i.test(href)) return "web";
	if (/^(mailto|tel|sms):/i.test(href) || href.startsWith("#")) return "plain";
	if (/^file:\/\//i.test(href)) return "file";

	const path = stripHrefMetadata(href);
	const fileName = fileNameFromPath(path);
	if (!fileName || fileName === "." || fileName === "..") return "plain";

	if (/[/\\]/.test(path)) return "file";
	return getFileIcon(fileName) === "icon-file" ? "plain" : "file";
}

function fileNameFromHref(href: string): string {
	return fileNameFromPath(stripHrefMetadata(href));
}

function stripHrefMetadata(href: string): string {
	return href
		.replace(/^file:\/\//i, "")
		.split(/[?#]/, 1)[0]
		.replace(/:\d+(?::\d+)?$/, "");
}

function fileNameFromPath(path: string): string {
	const parts = path.split(/[/\\]/).filter(Boolean);
	return parts[parts.length - 1] || path;
}
