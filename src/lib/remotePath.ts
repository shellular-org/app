export function normalizeRemoteWorkspacePath(path: string, baseDir?: string) {
	const raw = path.trim();
	if (!raw || raw === ".") return baseDir ?? raw;
	if (raw.includes("://")) return raw;

	if (isRemoteAbsolutePath(raw)) return normalizeRemotePath(raw);
	if (!baseDir) return normalizeRemotePath(raw);

	const combined = joinRemotePath(baseDir, raw);
	return isWindowsPathLike(baseDir)
		? normalizeWindowsPath(combined)
		: normalizePosixPath(combined.replace(/\\/g, "/"));
}

export function isRemoteAbsolutePath(path: string) {
	return (
		path.startsWith("/") ||
		path.startsWith("\\") ||
		/^[a-zA-Z]:[\\/]/.test(path) ||
		/^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(path)
	);
}

function joinRemotePath(baseDir: string, path: string) {
	const separator = isWindowsPathLike(baseDir) ? "\\" : "/";
	const base = baseDir.replace(/[\\/]+$/, "");
	const child = path.replace(/^\.[\\/]/, "").replace(/^[\\/]+/, "");
	return `${base}${separator}${child}`;
}

function normalizeRemotePath(path: string) {
	if (isWindowsPathLike(path)) return normalizeWindowsPath(path);
	return normalizePosixPath(path);
}

function isWindowsPathLike(path: string) {
	return (
		path.includes("\\") ||
		/^[a-zA-Z]:[\\/]/.test(path) ||
		/^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(path)
	);
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

function normalizeWindowsPath(path: string) {
	const normalizedInput = path.replace(/\//g, "\\");
	const uncMatch = normalizedInput.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/);
	if (uncMatch) {
		const root = `\\\\${uncMatch[1]}\\${uncMatch[2]}`;
		const normalized = normalizeWindowsSegments(uncMatch[3] ?? "", true);
		return normalized ? `${root}\\${normalized}` : root;
	}

	const driveMatch = normalizedInput.match(/^([a-zA-Z]:)\\?(.*)$/);
	if (driveMatch?.[0].startsWith(`${driveMatch[1]}\\`)) {
		const normalized = normalizeWindowsSegments(driveMatch[2] ?? "", true);
		return normalized
			? `${driveMatch[1]}\\${normalized}`
			: `${driveMatch[1]}\\`;
	}

	if (normalizedInput.startsWith("\\")) {
		const normalized = normalizeWindowsSegments(normalizedInput.slice(1), true);
		return normalized ? `\\${normalized}` : "\\";
	}

	return normalizeWindowsSegments(normalizedInput, false) || ".";
}

function normalizeWindowsSegments(path: string, absolute: boolean) {
	const parts: string[] = [];

	for (const segment of path.split("\\")) {
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

	return parts.join("\\");
}
