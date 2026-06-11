import type { AcpMessagePart } from "@shellular/protocol";

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export async function copyTextToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		return;
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.style.cssText =
			"position:fixed;top:-9999px;left:-9999px;opacity:0;";
		document.body.appendChild(textarea);
		textarea.select();
		try {
			document.execCommand("copy");
		} finally {
			document.body.removeChild(textarea);
		}
	}
}

export function stripAnsi(text: string): string {
	return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

export function normalizeClassName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

export function findLastIndex<T>(
	items: T[],
	predicate: (item: T) => boolean,
): number {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		if (predicate(items[index])) return index;
	}
	return -1;
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}

export function fileUri(path: string): string {
	return `file://${path}`;
}

export function getRenderPartKey(part: AcpMessagePart, index: number): string {
	const id = "id" in part ? part.id : undefined;
	if (id) return id;
	switch (part.type) {
		case "file_reference":
		case "file_change":
			return `part-${index}-${part.type}-${part.path}`;
		case "web_reference":
			return `part-${index}-web-${part.url}`;
		case "resource":
			return `part-${index}-resource-${part.uri}`;
		default:
			return `part-${index}-${part.type}`;
	}
}
