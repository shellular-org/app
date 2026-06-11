export function getPlatformIcon(platform: string): string {
	const p = platform.toLowerCase();
	if (p.includes("linux")) return "icon-linux";
	if (p.includes("darwin") || p.includes("mac")) return "icon-apple";
	if (p.includes("win")) return "icon-windows";
	if (p.includes("android")) return "icon-android";
	if (p.includes("ios")) return "icon-ios";
	return "icon-monitor";
}

export function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60_000);
	const hours = Math.floor(diff / 3_600_000);
	const days = Math.floor(diff / 86_400_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

export function getFileExtension(path: string): string {
	const name = path.split("/").pop() || path;
	const dotIndex = name.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === name.length - 1) return "";
	return name.slice(dotIndex + 1).toLowerCase();
}

export function getFileMimeType(path: string): string {
	const ext = getFileExtension(path);
	const types: Record<string, string> = {
		css: "text/css",
		csv: "text/csv",
		gif: "image/gif",
		html: "text/html",
		jpeg: "image/jpeg",
		jpg: "image/jpeg",
		js: "text/javascript",
		json: "application/json",
		jsx: "text/javascript",
		md: "text/markdown",
		pdf: "application/pdf",
		png: "image/png",
		py: "text/x-python",
		rs: "text/x-rust",
		scss: "text/x-scss",
		sh: "application/x-sh",
		ts: "text/typescript",
		tsx: "text/tsx",
		txt: "text/plain",
		webp: "image/webp",
		yaml: "application/yaml",
		yml: "application/yaml",
	};
	return types[ext] ?? "text/plain";
}

export function formatFileSize(bytes?: number): string {
	if (bytes === undefined) return "File";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getOnlineStatus() {
	if (typeof navigator === "undefined") {
		return true;
	}

	return navigator.onLine;
}
