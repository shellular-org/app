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

const projectMutationQueues = new Map<string, Promise<Project[]>>();

export async function loadProjects(hostId: string): Promise<Project[]> {
	try {
		const path = projectsPath(hostId);
		const exists = await file.exists(path);
		if (!exists) return [];
		const text = (await file.read(path, "text")) as string;
		return normalizeProjects(JSON.parse(text));
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
): Promise<Project[]> {
	return enqueueProjectMutation(hostId, async (projects) => {
		const normalizedPath = normalizeProjectPath(path);
		if (projects.some((project) => project.path === normalizedPath)) {
			return projects;
		}
		const name =
			normalizedPath.split("/").filter(Boolean).pop() || normalizedPath;
		return [...projects, { path: normalizedPath, name, addedAt: Date.now() }];
	});
}

export async function removeProject(
	hostId: string,
	path: string,
): Promise<Project[]> {
	return enqueueProjectMutation(hostId, async (projects) => {
		const normalizedPath = normalizeProjectPath(path);
		return projects.filter((project) => project.path !== normalizedPath);
	});
}

function enqueueProjectMutation(
	hostId: string,
	mutate: (projects: Project[]) => Project[] | Promise<Project[]>,
) {
	const previous = projectMutationQueues.get(hostId) ?? Promise.resolve([]);
	const pending = previous
		.catch(() => [])
		.then(async () => {
			const current = await loadProjects(hostId);
			const updated = normalizeProjects(await mutate(current));
			if (!sameProjects(current, updated)) await saveProjects(hostId, updated);
			return updated;
		});
	projectMutationQueues.set(hostId, pending);
	const cleanup = () => {
		if (projectMutationQueues.get(hostId) === pending) {
			projectMutationQueues.delete(hostId);
		}
	};
	void pending.then(cleanup, cleanup);
	return pending;
}

function normalizeProjects(value: unknown): Project[] {
	if (!Array.isArray(value)) return [];
	const projects: Project[] = [];
	const paths = new Set<string>();
	for (const candidate of value) {
		if (!candidate || typeof candidate !== "object") continue;
		const raw = candidate as Partial<Project>;
		if (typeof raw.path !== "string" || !raw.path) continue;
		const path = normalizeProjectPath(raw.path);
		if (paths.has(path)) continue;
		paths.add(path);
		projects.push({
			path,
			name:
				typeof raw.name === "string" && raw.name
					? raw.name
					: path.split("/").filter(Boolean).pop() || path,
			addedAt:
				typeof raw.addedAt === "number" && Number.isFinite(raw.addedAt)
					? raw.addedAt
					: Date.now(),
		});
	}
	return projects;
}

function normalizeProjectPath(value: string) {
	const normalized = value.split("\\").join("/");
	return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function sameProjects(left: Project[], right: Project[]) {
	return (
		left.length === right.length &&
		left.every(
			(project, index) =>
				project.path === right[index]?.path &&
				project.name === right[index]?.name &&
				project.addedAt === right[index]?.addedAt,
		)
	);
}
