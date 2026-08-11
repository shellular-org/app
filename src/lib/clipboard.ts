import native from "bridge/native";
import toast from "lib/toast";

interface CopyToClipboardOptions {
	text: string;
	successMessage?: string;
	errorMessage?: string;
}

export async function copyToClipboard({
	text,
	successMessage = "Copied to clipboard",
	errorMessage = "Failed to copy",
}: CopyToClipboardOptions) {
	try {
		if (process.env.IS_MACOS) {
			await native.writeClipboardText(text);
		} else if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
		} else {
			throw new Error("Clipboard API is unavailable");
		}
		if (!process.env.IS_ANDROID && successMessage) {
			toast(successMessage);
		}
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.style.cssText =
			"position:fixed;top:-9999px;left:-9999px;opacity:0;";
		document.body.appendChild(textarea);
		textarea.select();
		try {
			document.execCommand("copy");
			if (!process.env.IS_ANDROID && successMessage) {
				toast(successMessage);
			}
		} catch {
			if (!process.env.IS_ANDROID && errorMessage) {
				toast(errorMessage);
			}
		} finally {
			document.body.removeChild(textarea);
		}
	}
}

export async function readFromClipboard() {
	if (process.env.IS_MACOS) return native.readClipboardText();
	if (!navigator.clipboard?.readText)
		throw new Error("Clipboard API is unavailable");
	return navigator.clipboard.readText();
}
