import type { GitFileStatus, GitWorkingTreeStatus } from "state";

const STATUS_PRIORITY: Record<GitFileStatus, number> = {
	deleted: 7,
	renamed: 6,
	modified: 5,
	added: 4,
	untracked: 3,
	staged: 2,
	ignored: 1,
};

/** Build file and ancestor-folder decorations without rescanning the repository. */
export function deriveProjectTreeGitStatus(
	status: GitWorkingTreeStatus | null | undefined,
	projectPath: string,
) {
	const result = new Map<string, GitFileStatus>();
	if (!status?.hasGit) return result;
	const projectPrefix = relativeProjectPrefix(status.root, projectPath);
	for (const file of status.files) {
		const repositoryPath = normalize(file.path);
		const relativePath = projectPrefix
			? repositoryPath === projectPrefix
				? ""
				: repositoryPath.startsWith(`${projectPrefix}/`)
					? repositoryPath.slice(projectPrefix.length + 1)
					: null
			: repositoryPath;
		if (!relativePath) continue;
		setHigherPriority(result, relativePath, file.status);
		let ancestor = parent(relativePath);
		while (ancestor) {
			setHigherPriority(result, ancestor, file.status);
			ancestor = parent(ancestor);
		}
	}
	return result;
}

function setHigherPriority(
	statuses: Map<string, GitFileStatus>,
	path: string,
	status: GitFileStatus,
) {
	const existing = statuses.get(path);
	if (!existing || STATUS_PRIORITY[status] > STATUS_PRIORITY[existing]) {
		statuses.set(path, status);
	}
}

function relativeProjectPrefix(root: string | undefined, projectPath: string) {
	if (!root) return "";
	const normalizedRoot = normalize(root).replace(/\/$/, "");
	const normalizedProject = normalize(projectPath).replace(/\/$/, "");
	return normalizedProject === normalizedRoot
		? ""
		: normalizedProject.startsWith(`${normalizedRoot}/`)
			? normalizedProject.slice(normalizedRoot.length + 1)
			: "";
}

function normalize(path: string) {
	return path.split("\\").join("/").replace(/^\.\//, "");
}

function parent(path: string) {
	const index = path.lastIndexOf("/");
	return index < 0 ? "" : path.slice(0, index);
}
