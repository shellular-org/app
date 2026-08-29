import { joinRemotePath } from "lib/remotePath";
import { getHostInfo } from "state/connection";
import {
	listProjectDirectory,
	type ProjectFileSearchEntry,
	type ProjectTreeEntry,
} from "state/filesystem";

export interface ProjectDirectoryState {
	status: "idle" | "loading" | "ready" | "error";
	childPaths: readonly string[];
	error: string | null;
}

export interface ProjectTreeSnapshot {
	entries: readonly ProjectTreeEntry[];
	entryByPath: ReadonlyMap<string, ProjectTreeEntry>;
	directories: ReadonlyMap<string, ProjectDirectoryState>;
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

interface ProjectState {
	hostId: string;
	projectPath: string;
	snapshot: ProjectTreeSnapshot;
	generation: number;
	directoryVersions: Map<string, number>;
	requests: Map<string, Promise<void>>;
	requestControllers: Map<string, AbortController>;
	controllers: Set<AbortController>;
	searchPaths: Set<string>;
}

interface QueueTask {
	priority: number;
	sequence: number;
	run: () => Promise<void>;
}

const EMPTY_DIRECTORIES = new Map<string, ProjectDirectoryState>();
const EMPTY_ENTRIES = new Map<string, ProjectTreeEntry>();
const EMPTY: ProjectTreeSnapshot = {
	entries: [],
	entryByPath: EMPTY_ENTRIES,
	directories: EMPTY_DIRECTORIES,
	revision: 0,
};
const states = new Map<string, ProjectState>();
const listeners = new Map<string, Set<() => void>>();
const queue: QueueTask[] = [];
const MAX_CONCURRENT_REQUESTS = 2;
const DIRECTORY_TIMEOUT_MS = 15_000;
let activeRequests = 0;
let queueSequence = 0;

function hostId() {
	return getHostInfo()?.id ?? "local";
}

function key(projectPath: string, requestedHostId = hostId()) {
	return `${requestedHostId}:${projectPath}`;
}

function createProjectState(projectPath: string): ProjectState {
	const requestedHostId = hostId();
	return {
		hostId: requestedHostId,
		projectPath,
		snapshot: EMPTY,
		generation: 0,
		directoryVersions: new Map(),
		requests: new Map(),
		requestControllers: new Map(),
		controllers: new Set(),
		searchPaths: new Set(),
	};
}

function getOrCreateProjectState(projectPath: string) {
	const projectKey = key(projectPath);
	let state = states.get(projectKey);
	if (!state) {
		state = createProjectState(projectPath);
		states.set(projectKey, state);
	}
	return state;
}

function emit(projectKey: string, state: ProjectState) {
	states.set(projectKey, state);
	for (const listener of listeners.get(projectKey) ?? []) listener();
}

export function subscribeProjectTree(
	projectPath: string,
	listener: () => void,
) {
	const projectKey = key(projectPath);
	let projectListeners = listeners.get(projectKey);
	if (!projectListeners) {
		projectListeners = new Set();
		listeners.set(projectKey, projectListeners);
	}
	projectListeners.add(listener);
	return () => {
		projectListeners?.delete(listener);
		if (projectListeners?.size === 0) listeners.delete(projectKey);
	};
}

export function getProjectTreeSnapshot(projectPath: string) {
	return states.get(key(projectPath))?.snapshot ?? EMPTY;
}

export function ensureProjectDirectory(
	projectPath: string,
	relativeDirectory = "",
	options: { refresh?: boolean; priority?: "user" | "background" } = {},
): Promise<void> {
	const directory = normalizeDirectory(relativeDirectory);
	const projectKey = key(projectPath);
	const state = getOrCreateProjectState(projectPath);
	const current = state.snapshot.directories.get(directory);
	const existing = state.requests.get(directory);
	if (existing && !options.refresh) return existing;
	if (existing) {
		state.requestControllers.get(directory)?.abort();
		state.requests.delete(directory);
		state.requestControllers.delete(directory);
	}
	if (!options.refresh && current?.status === "ready") {
		return Promise.resolve();
	}

	const version = (state.directoryVersions.get(directory) ?? 0) + 1;
	state.directoryVersions.set(directory, version);
	const generation = state.generation;
	setDirectoryState(projectKey, state, directory, {
		status: "loading",
		childPaths: current?.childPaths ?? [],
		error: null,
	});

	const controller = new AbortController();
	state.controllers.add(controller);
	state.requestControllers.set(directory, controller);
	const request = enqueue(options.priority === "user" ? 0 : 1, async () => {
		try {
			const absolutePath = directory
				? joinRemotePath(projectPath, directory)
				: projectPath;
			const entries = await listProjectDirectory(absolutePath, {
				timeoutMs: DIRECTORY_TIMEOUT_MS,
				signal: controller.signal,
			});
			if (!isCurrent(state, directory, generation, version)) return;
			applyDirectoryResult(projectKey, state, directory, entries);
		} catch (error) {
			if (!isCurrent(state, directory, generation, version)) return;
			const previous = state.snapshot.directories.get(directory);
			setDirectoryState(projectKey, state, directory, {
				status: "error",
				childPaths: previous?.childPaths ?? [],
				error: messageForError(error),
			});
		} finally {
			state.controllers.delete(controller);
			if (state.requests.get(directory) === request) {
				state.requests.delete(directory);
				state.requestControllers.delete(directory);
			}
		}
	});
	state.requests.set(directory, request);
	return request;
}

/** Backwards-compatible root helper for existing callers. */
export function ensureProjectTree(projectPath: string, refresh = false) {
	return ensureProjectDirectory(projectPath, "", {
		refresh,
		priority: "background",
	});
}

export function refreshProjectDirectory(
	projectPath: string,
	relativeDirectory: string,
) {
	return ensureProjectDirectory(projectPath, relativeDirectory, {
		refresh: true,
		priority: "user",
	});
}

export function refreshProjectExplorer(projectPath: string) {
	const projectKey = key(projectPath);
	const state = getOrCreateProjectState(projectPath);
	cancelProjectState(state);
	state.directoryVersions.clear();
	state.searchPaths.clear();
	state.snapshot = EMPTY;
	emit(projectKey, state);
	return ensureProjectDirectory(projectPath, "", {
		refresh: true,
		priority: "user",
	});
}

export function applyProjectTreeMutation(
	projectPath: string,
	mutation: ProjectTreeMutation,
) {
	const projectKey = key(projectPath);
	const state = states.get(projectKey);
	if (!state) return undefined;
	const entries = mutateEntries([...state.snapshot.entries], mutation);
	const directories = mutateDirectories(state.snapshot.directories, mutation);
	state.snapshot = makeSnapshot(
		entries,
		directories,
		state.snapshot.revision + 1,
	);
	emit(projectKey, state);
	return state.snapshot.revision;
}

export function hydrateProjectTreeSearchResults(
	projectPath: string,
	results: readonly ProjectFileSearchEntry[],
) {
	const projectKey = key(projectPath);
	const state = getOrCreateProjectState(projectPath);
	const entries = new Map(state.snapshot.entryByPath);
	removeOldSearchEntries(state, entries);
	const structuralPaths = collectStructuralPaths(state.snapshot.directories);
	const nextSearchPaths = new Set<string>();
	for (const result of results) {
		const path = normalizePath(result.relativePath);
		if (!isSafeRelativePath(path)) continue;
		const segments = path.split("/");
		for (let index = 1; index < segments.length; index += 1) {
			const ancestor = segments.slice(0, index).join("/");
			if (!entries.has(ancestor)) {
				entries.set(ancestor, { relativePath: ancestor, type: "directory" });
			}
			if (!structuralPaths.has(ancestor)) nextSearchPaths.add(ancestor);
		}
		entries.set(path, {
			relativePath: path,
			type: result.type,
			gitStatus: result.gitStatus,
		});
		if (!structuralPaths.has(path)) nextSearchPaths.add(path);
	}
	state.searchPaths = nextSearchPaths;
	state.snapshot = makeSnapshot(
		sortEntries([...entries.values()]),
		state.snapshot.directories,
		state.snapshot.revision + 1,
	);
	emit(projectKey, state);
}

export function pruneProjectTreeWorkspace(projectPaths: readonly string[]) {
	const activeHost = hostId();
	const active = new Set(projectPaths);
	for (const [projectKey, state] of states) {
		if (state.hostId === activeHost && active.has(state.projectPath)) continue;
		cancelProjectState(state);
		states.delete(projectKey);
		listeners.delete(projectKey);
	}
}

export function resetProjectTreeWorkspace() {
	for (const state of states.values()) cancelProjectState(state);
	states.clear();
	listeners.clear();
}

function enqueue(priority: number, run: () => Promise<void>) {
	return new Promise<void>((resolve) => {
		queue.push({
			priority,
			sequence: queueSequence++,
			run: async () => {
				try {
					await run();
				} finally {
					resolve();
				}
			},
		});
		queue.sort(
			(left, right) =>
				left.priority - right.priority || left.sequence - right.sequence,
		);
		queueMicrotask(pumpQueue);
	});
}

function pumpQueue() {
	while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
		const task = queue.shift();
		if (!task) return;
		activeRequests += 1;
		void task.run().finally(() => {
			activeRequests -= 1;
			pumpQueue();
		});
	}
}

function isCurrent(
	state: ProjectState,
	directory: string,
	generation: number,
	version: number,
) {
	return (
		states.get(key(state.projectPath, state.hostId)) === state &&
		state.generation === generation &&
		state.directoryVersions.get(directory) === version
	);
}

function applyDirectoryResult(
	projectKey: string,
	state: ProjectState,
	directory: string,
	listedEntries: readonly {
		name: string;
		type: "directory" | "file";
		gitStatus?: ProjectTreeEntry["gitStatus"];
	}[],
) {
	const visible = listedEntries.filter(
		(entry) => entry.name !== ".git" && entry.name !== ".DS_Store",
	);
	const nextChildren: ProjectTreeEntry[] = [];
	for (const entry of visible) {
		if (!isSafeName(entry.name)) continue;
		const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
		nextChildren.push({
			relativePath,
			type: entry.type,
			gitStatus: entry.gitStatus,
		});
	}
	const entries = new Map(state.snapshot.entryByPath);
	const previous = state.snapshot.directories.get(directory)?.childPaths ?? [];
	const nextByPath = new Map(
		nextChildren.map((entry) => [entry.relativePath, entry]),
	);
	const directories = new Map(state.snapshot.directories);
	for (const childPath of previous) {
		const oldEntry = entries.get(childPath);
		const nextEntry = nextByPath.get(childPath);
		if (nextEntry && oldEntry?.type === nextEntry.type) continue;
		removeSubtree(entries, directories, childPath);
	}
	for (const entry of nextChildren) {
		entries.set(entry.relativePath, entry);
		if (entry.type === "directory" && !directories.has(entry.relativePath)) {
			directories.set(entry.relativePath, idleDirectory());
		}
	}
	directories.set(directory, {
		status: "ready",
		childPaths: nextChildren.map((entry) => entry.relativePath),
		error: null,
	});
	state.snapshot = makeSnapshot(
		sortEntries([...entries.values()]),
		directories,
		state.snapshot.revision + 1,
	);
	emit(projectKey, state);
}

function setDirectoryState(
	projectKey: string,
	state: ProjectState,
	directory: string,
	directoryState: ProjectDirectoryState,
) {
	const directories = new Map(state.snapshot.directories);
	directories.set(directory, directoryState);
	state.snapshot = { ...state.snapshot, directories };
	emit(projectKey, state);
}

function makeSnapshot(
	entries: readonly ProjectTreeEntry[],
	directories: ReadonlyMap<string, ProjectDirectoryState>,
	revision: number,
): ProjectTreeSnapshot {
	return {
		entries,
		entryByPath: new Map(entries.map((entry) => [entry.relativePath, entry])),
		directories,
		revision,
	};
}

function cancelProjectState(state: ProjectState) {
	state.generation += 1;
	for (const controller of state.controllers) controller.abort();
	state.controllers.clear();
	state.requests.clear();
	state.requestControllers.clear();
}

function removeOldSearchEntries(
	state: ProjectState,
	entries: Map<string, ProjectTreeEntry>,
) {
	const structural = collectStructuralPaths(state.snapshot.directories);
	for (const path of state.searchPaths) {
		if (!structural.has(path)) entries.delete(path);
	}
	state.searchPaths.clear();
}

function collectStructuralPaths(
	directories: ReadonlyMap<string, ProjectDirectoryState>,
) {
	const result = new Set<string>();
	for (const [directory, state] of directories) {
		if (directory) result.add(directory);
		for (const child of state.childPaths) result.add(child);
	}
	return result;
}

function removeSubtree(
	entries: Map<string, ProjectTreeEntry>,
	directories: Map<string, ProjectDirectoryState>,
	path: string,
) {
	for (const candidate of [...entries.keys()]) {
		if (candidate === path || candidate.startsWith(`${path}/`)) {
			entries.delete(candidate);
		}
	}
	for (const candidate of [...directories.keys()]) {
		if (candidate === path || candidate.startsWith(`${path}/`)) {
			directories.delete(candidate);
		}
	}
}

function mutateDirectories(
	current: ReadonlyMap<string, ProjectDirectoryState>,
	mutation: ProjectTreeMutation,
) {
	const directories = new Map(current);
	if (mutation.type === "add") {
		const path = normalizePath(mutation.path);
		const parent = parentDirectory(path);
		const state = directories.get(parent);
		if (state?.status === "ready" && !state.childPaths.includes(path)) {
			directories.set(parent, {
				...state,
				childPaths: [...state.childPaths, path],
			});
		}
		if (mutation.entryType === "directory") {
			directories.set(path, idleDirectory());
		}
		return directories;
	}
	if (mutation.type === "remove") {
		const path = normalizePath(mutation.path);
		removePathFromDirectoryChildren(directories, path);
		for (const candidate of [...directories.keys()]) {
			if (candidate === path || candidate.startsWith(`${path}/`)) {
				directories.delete(candidate);
			}
		}
		return directories;
	}
	const from = normalizePath(mutation.fromPath);
	const to = normalizePath(mutation.toPath);
	removePathFromDirectoryChildren(directories, from);
	const next = new Map<string, ProjectDirectoryState>();
	for (const [directory, state] of directories) {
		const renamedDirectory = renameSubtreePath(directory, from, to);
		next.set(renamedDirectory, {
			...state,
			childPaths: state.childPaths.map((path) =>
				renameSubtreePath(path, from, to),
			),
		});
	}
	const parent = parentDirectory(to);
	const parentState = next.get(parent);
	if (parentState?.status === "ready") {
		next.set(parent, {
			...parentState,
			childPaths: [...parentState.childPaths, to],
		});
	}
	return next;
}

function removePathFromDirectoryChildren(
	directories: Map<string, ProjectDirectoryState>,
	path: string,
) {
	const parent = parentDirectory(path);
	const state = directories.get(parent);
	if (!state) return;
	directories.set(parent, {
		...state,
		childPaths: state.childPaths.filter((child) => child !== path),
	});
}

function mutateEntries(
	entries: ProjectTreeEntry[],
	mutation: ProjectTreeMutation,
) {
	if (mutation.type === "add") {
		const path = normalizePath(mutation.path);
		if (entries.some((entry) => entry.relativePath === path)) return entries;
		return sortEntries([
			...entries,
			{ relativePath: path, type: mutation.entryType },
		]);
	}
	if (mutation.type === "remove") {
		const path = normalizePath(mutation.path);
		return entries.filter(
			(entry) =>
				entry.relativePath !== path &&
				!entry.relativePath.startsWith(`${path}/`),
		);
	}
	const fromPath = normalizePath(mutation.fromPath);
	const toPath = normalizePath(mutation.toPath);
	return sortEntries(
		entries.map((entry) => ({
			...entry,
			relativePath: renameSubtreePath(entry.relativePath, fromPath, toPath),
		})),
	);
}

export function validateProjectTreeEntries(entries: ProjectTreeEntry[]) {
	const validated: ProjectTreeEntry[] = [];
	const types = new Map<string, ProjectTreeEntry["type"]>();
	for (const entry of entries) {
		const relativePath = normalizePath(entry.relativePath);
		if (!isSafeRelativePath(relativePath)) {
			throw new Error(`Invalid project tree path: "${entry.relativePath}"`);
		}
		const existing = types.get(relativePath);
		if (existing && existing !== entry.type) {
			throw new Error(
				`Conflicting project tree entry types for: "${relativePath}"`,
			);
		}
		if (existing) continue;
		types.set(relativePath, entry.type);
		validated.push({ ...entry, relativePath });
	}
	return validated;
}

function sortEntries(entries: ProjectTreeEntry[]) {
	const children = new Map<string, ProjectTreeEntry[]>();
	for (const entry of entries) {
		const parent = parentDirectory(entry.relativePath);
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

function normalizePath(value: string) {
	return value.split("\\").join("/").replace(/^\.\//, "").replace(/\/$/, "");
}

function normalizeDirectory(value: string) {
	const directory = normalizePath(value);
	if (directory && !isSafeRelativePath(directory)) {
		throw new Error(`Invalid project directory: "${value}"`);
	}
	return directory;
}

function isSafeRelativePath(path: string) {
	return (
		Boolean(path) &&
		!path.startsWith("/") &&
		!/^[a-zA-Z]:\//.test(path) &&
		path.split("/").every(isSafeName)
	);
}

function isSafeName(name: string) {
	return Boolean(name) && name !== "." && name !== ".." && !/[\\/]/.test(name);
}

function idleDirectory(): ProjectDirectoryState {
	return { status: "idle", childPaths: [], error: null };
}

function parentDirectory(path: string) {
	const index = path.lastIndexOf("/");
	return index < 0 ? "" : path.slice(0, index);
}

function renameSubtreePath(path: string, from: string, to: string) {
	return path === from || path.startsWith(`${from}/`)
		? `${to}${path.slice(from.length)}`
		: path;
}

function basename(path: string) {
	return path.slice(path.lastIndexOf("/") + 1);
}

function messageForError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message || "Unable to load folder";
}
