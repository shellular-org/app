import { getHostInfo } from "state/connection";
import { loadProjectTreePage, type ProjectTreeEntry } from "state/filesystem";

export interface ProjectTreeSnapshot {
	entries: ProjectTreeEntry[];
	loading: boolean;
	error: string | null;
	revision: number;
}

export type ProjectTreeMutation =
	| { type: "add"; path: string; entryType: ProjectTreeEntry["type"] }
	| {
			type: "move";
			fromPath: string;
			toPath: string;
			entryType: ProjectTreeEntry["type"];
	  }
	| { type: "remove"; path: string; entryType: ProjectTreeEntry["type"] };

const EMPTY: ProjectTreeSnapshot = {
	entries: [],
	loading: false,
	error: null,
	revision: 0,
};
const states = new Map<string, ProjectTreeSnapshot>();
const listeners = new Set<() => void>();
const versions = new Map<string, number>();
const requests = new Map<string, Promise<void>>();

function key(projectPath: string) {
	return `${getHostInfo()?.id ?? "local"}:${projectPath}`;
}

function emit(projectKey: string, next: ProjectTreeSnapshot) {
	states.set(projectKey, next);
	for (const listener of listeners) listener();
}

export function subscribeProjectTrees(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getProjectTreeSnapshot(projectPath: string) {
	return states.get(key(projectPath)) ?? EMPTY;
}

export function applyProjectTreeMutation(
	projectPath: string,
	mutation: ProjectTreeMutation,
) {
	const projectKey = key(projectPath);
	const current = states.get(projectKey);
	if (!current) return undefined;
	const entries = mutateEntries(current.entries, mutation);
	const next = {
		...current,
		entries,
		error: null,
		revision: current.revision + 1,
	};
	emit(projectKey, next);
	return next.revision;
}

export function ensureProjectTree(projectPath: string, refresh = false) {
	const projectKey = key(projectPath);
	const current = states.get(projectKey);
	const existingRequest = requests.get(projectKey);
	if (!refresh && existingRequest) return existingRequest;
	if (!refresh && current && !current.error && current.revision > 0) {
		return Promise.resolve();
	}

	const version = (versions.get(projectKey) ?? 0) + 1;
	versions.set(projectKey, version);
	emit(projectKey, {
		entries: current?.entries ?? [],
		loading: true,
		error: null,
		revision: current?.revision ?? 0,
	});

	const request = readAllPages(projectPath, refresh)
		.then((entries) => {
			if (versions.get(projectKey) !== version) return;
			emit(projectKey, {
				entries,
				loading: false,
				error: null,
				revision: (current?.revision ?? 0) + 1,
			});
		})
		.catch((error) => {
			if (versions.get(projectKey) !== version) return;
			emit(projectKey, {
				entries: current?.entries ?? [],
				loading: false,
				error: (error as Error).message || "Unable to load project tree",
				revision: current?.revision ?? 0,
			});
		})
		.finally(() => {
			if (requests.get(projectKey) === request) requests.delete(projectKey);
		});
	requests.set(projectKey, request);
	return request;
}

export function resetProjectTreeWorkspace() {
	states.clear();
	versions.clear();
	requests.clear();
	for (const listener of listeners) listener();
}

async function readAllPages(
	projectPath: string,
	refresh: boolean,
	retryExpiredSnapshot = true,
) {
	let cursor: number | undefined;
	let snapshotId: string | undefined;
	const entries: ProjectTreeEntry[] = [];
	try {
		do {
			const page = await loadProjectTreePage({
				path: projectPath,
				snapshotId,
				cursor,
				pageSize: 2000,
				refresh: !snapshotId && refresh,
			});
			if (snapshotId && page.snapshotId !== snapshotId) {
				throw new Error("Project tree snapshot changed while loading.");
			}
			snapshotId = page.snapshotId;
			entries.push(...page.entries);
			cursor = page.nextCursor;
		} while (cursor !== undefined);
		return validateProjectTreeEntries(entries);
	} catch (error) {
		if (retryExpiredSnapshot && /snapshot/i.test((error as Error).message)) {
			return readAllPages(projectPath, true, false);
		}
		throw error;
	}
}

export function validateProjectTreeEntries(entries: ProjectTreeEntry[]) {
	const validated: ProjectTreeEntry[] = [];
	const types = new Map<string, ProjectTreeEntry["type"]>();
	for (const entry of entries) {
		const relativePath = entry.relativePath
			.split("\\")
			.join("/")
			.replace(/^\.\//, "")
			.replace(/\/$/, "");
		const segments = relativePath.split("/");
		if (
			!relativePath ||
			relativePath.startsWith("/") ||
			/^[a-zA-Z]:\//.test(relativePath) ||
			segments.some(
				(segment) => !segment || segment === "." || segment === "..",
			)
		) {
			throw new Error(`Invalid project tree path: "${entry.relativePath}"`);
		}
		if (entry.type !== "directory" && entry.type !== "file") {
			throw new Error(`Invalid project tree entry type for: "${relativePath}"`);
		}
		const existing = types.get(relativePath);
		if (existing) {
			if (existing !== entry.type) {
				throw new Error(
					`Conflicting project tree entry types for: "${relativePath}"`,
				);
			}
			continue;
		}
		types.set(relativePath, entry.type);
		validated.push({ ...entry, relativePath });
	}
	return validated;
}

function mutateEntries(
	entries: ProjectTreeEntry[],
	mutation: ProjectTreeMutation,
) {
	const normalize = (value: string) =>
		value.split("\\").join("/").replace(/^\.\//, "").replace(/\/$/, "");
	if (mutation.type === "add") {
		const path = normalize(mutation.path);
		if (entries.some((entry) => entry.relativePath === path)) return entries;
		return sortEntries([
			...entries,
			{ relativePath: path, type: mutation.entryType },
		]);
	}
	if (mutation.type === "remove") {
		const path = normalize(mutation.path);
		return entries.filter(
			(entry) =>
				entry.relativePath !== path &&
				!entry.relativePath.startsWith(`${path}/`),
		);
	}
	const fromPath = normalize(mutation.fromPath);
	const toPath = normalize(mutation.toPath);
	return sortEntries(
		entries.map((entry) =>
			entry.relativePath === fromPath ||
			entry.relativePath.startsWith(`${fromPath}/`)
				? {
						...entry,
						relativePath: `${toPath}${entry.relativePath.slice(fromPath.length)}`,
					}
				: entry,
		),
	);
}

function sortEntries(entries: ProjectTreeEntry[]) {
	const children = new Map<string, ProjectTreeEntry[]>();
	for (const entry of entries) {
		const index = entry.relativePath.lastIndexOf("/");
		const parent = index < 0 ? "" : entry.relativePath.slice(0, index);
		const siblings = children.get(parent) ?? [];
		siblings.push(entry);
		children.set(parent, siblings);
	}
	const result: ProjectTreeEntry[] = [];
	const visit = (parent: string) => {
		const siblings = children.get(parent) ?? [];
		siblings.sort((left, right) => {
			if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
			return basename(left.relativePath).localeCompare(
				basename(right.relativePath),
				undefined,
				{ numeric: true, sensitivity: "base" },
			);
		});
		for (const entry of siblings) {
			result.push(entry);
			if (entry.type === "directory") visit(entry.relativePath);
		}
	};
	visit("");
	return result;
}

function basename(path: string) {
	return path.slice(path.lastIndexOf("/") + 1);
}
