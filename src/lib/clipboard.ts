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
		await navigator.clipboard.writeText(text);
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
