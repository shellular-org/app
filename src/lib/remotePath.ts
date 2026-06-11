export function normalizeRemoteWorkspacePath(path: string, baseDir?: string) {
	const raw = path.trim();
	if (!raw || raw === ".") return baseDir ?? raw;
	if (raw.includes("://")) return raw;

	const combined = raw.startsWith("/")
		? raw
		: baseDir
			? `${baseDir.replace(/\/+$/, "")}/${raw.replace(/^\.\//, "")}`
			: raw;

	return normalizePosixPath(combined);
}

function normalizePosixPath(path: string) {
	const absolute = path.startsWith("/");
	const parts: string[] = [];

	for (const segment of path.split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") {
			if (parts.length > 0 && parts[parts.length - 1] !== "..") {
				parts.pop();
			} else if (!absolute) {
				parts.push(segment);
			}
			continue;
		}
		parts.push(segment);
	}

	const normalized = parts.join("/");
	if (absolute) return `/${normalized}`;
	return normalized || ".";
}
