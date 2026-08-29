import type { ProjectInfo } from "state";
import type { WorkbenchSurface } from "./types";

export type WorkbenchContextActivity = "home" | "remote" | "projects" | "git";

const ACTIVITY_TITLES: Record<WorkbenchContextActivity, string> = {
	home: "Home",
	remote: "Remote Access",
	projects: "Projects",
	git: "Source Control",
};

export function resolveWorkbenchContextTitle(
	surface: WorkbenchSurface | undefined,
	projects: ProjectInfo[],
	displayTitle?: string,
	activity: WorkbenchContextActivity = "home",
) {
	if (surface) {
		const path = projectPathForSurface(surface);
		const project = path ? findContainingProject(path, projects) : undefined;
		const projectName =
			project?.name ??
			(surface.kind === "git" ? surface.projectName : undefined);
		return (
			projectName || displayTitle || surface.title || ACTIVITY_TITLES[activity]
		);
	}

	if (activity === "projects" || activity === "git") {
		const candidates =
			activity === "git"
				? projects.filter((project) => project.gitInfo?.hasGit)
				: projects;
		if (candidates.length === 1) return candidates[0].name;
	}
	return ACTIVITY_TITLES[activity];
}

export function formatWorkbenchDocumentTitle(
	context: string,
	platform: "browser" | "macos",
) {
	return platform === "browser" ? `${context} — Shellular` : context;
}

export function findContainingProject(path: string, projects: ProjectInfo[]) {
	const normalizedPath = normalize(path);
	return [...projects]
		.sort((left, right) => right.path.length - left.path.length)
		.find((project) => {
			const root = normalize(project.path).replace(/\/$/, "");
			return normalizedPath === root || normalizedPath.startsWith(`${root}/`);
		});
}

export function projectPathForSurface(surface: WorkbenchSurface) {
	switch (surface.kind) {
		case "chat":
		case "agent-sessions":
		case "terminal":
			return surface.workspacePath;
		case "git":
			return surface.projectPath;
		case "files":
			return surface.initialPath;
		case "editor":
			return surface.comparison?.kind === "inline"
				? surface.comparison.workspacePath
				: (surface.comparison?.projectPath ??
						surface.gitComparison?.projectPath ??
						surface.filePath);
		case "utility":
		case "browser":
			return undefined;
	}
}

function normalize(path: string) {
	const normalized = path.split("\\").join("/").replace(/\/+$/, "");
	return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}
