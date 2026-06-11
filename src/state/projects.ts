import { MsgType, type ProjectInfoResultMsg } from "@shellular/protocol";

import file from "bridge/file";
import appConfig from "lib/appConfig";
import { sendRequest } from "./connection";

// ─── Types ────────────────────────────────────────────────────

export interface ProjectGitInfo {
	hasGit: boolean;
	branch?: string;
	ahead?: number;
	behind?: number;
	staged?: number;
	unstaged?: number;
	untracked?: number;
}

export interface Project {
	path: string;
	name: string;
	addedAt: number;
}

export interface ProjectInfo extends Project {
	gitInfo?: ProjectGitInfo;
}

// ─── Real git data via CLI ────────────────────────────────────

function resolveProjectPath(path: string, baseDir?: string): string {
	if (path.startsWith("/")) return path;
	if (!baseDir) return path;
	if (path === ".") return baseDir;
	const normalizedBase = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
	return `${normalizedBase}/${path}`;
}

/** Fetch real git info for a project path from the CLI. */
export async function getProjectInfo(
	path: string,
	baseDir?: string,
): Promise<ProjectGitInfo> {
	try {
		const resolvedPath = resolveProjectPath(path, baseDir);
		const res = await sendRequest<ProjectInfoResultMsg>({
			type: MsgType.PROJECT_INFO,
			data: { path: resolvedPath },
		});
		if (res.error || !res.data) return { hasGit: false };
		return res.data;
	} catch {
		return { hasGit: false };
	}
}

/** Fetch git info for all projects and return enriched ProjectInfo[]. */
export async function enrichProjectsWithGitInfo(
	projects: Project[],
	baseDir?: string,
): Promise<ProjectInfo[]> {
	const infos = await Promise.all(
		projects.map(async (p) => ({
			...p,
			gitInfo: await getProjectInfo(p.path, baseDir),
		})),
	);
	return infos;
}

// ─── Persistence ──────────────────────────────────────────────

function projectsPath(hostId: string): string {
	return `${appConfig.DATA_DIR}/projects-${hostId}.json`;
}

export async function loadProjects(hostId: string): Promise<Project[]> {
	try {
		const path = projectsPath(hostId);
		const exists = await file.exists(path);
		if (!exists) return [];
		const text = (await file.read(path, "text")) as string;
		return JSON.parse(text) as Project[];
	} catch {
		return [];
	}
}

async function saveProjects(
	hostId: string,
	projects: Project[],
): Promise<void> {
	await file.write(projectsPath(hostId), JSON.stringify(projects));
}

export async function addProject(
	hostId: string,
	path: string,
	existingProjects: Project[],
): Promise<Project[]> {
	const name = path.split("/").filter(Boolean).pop() || path;
	// Avoid duplicates
	if (existingProjects.some((p) => p.path === path)) return existingProjects;
	const project: Project = { path, name, addedAt: Date.now() };
	const updated = [...existingProjects, project];
	await saveProjects(hostId, updated);
	return updated;
}

export async function removeProject(
	hostId: string,
	path: string,
	existingProjects: Project[],
): Promise<Project[]> {
	const updated = existingProjects.filter((p) => p.path !== path);
	await saveProjects(hostId, updated);
	return updated;
}
