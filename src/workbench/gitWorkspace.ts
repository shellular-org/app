import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type GitDiffTarget,
	type GitOperation,
	type GitWorkingTreeStatus,
	type ProjectInfo,
	useShellular,
} from "state";
import {
	GIT_WORKTREE_CHANGED_EVENT,
	notifyGitWorktreeChanged,
} from "state/filesystem";

export interface DesktopGitRepositoryState {
	status: GitWorkingTreeStatus | null;
	loading: boolean;
	error: string | null;
	busy: GitOperation | null;
	processingPaths: Set<string>;
	selectionTarget: GitDiffTarget | null;
	selectedPaths: Set<string>;
	selectionAnchor: string | null;
	revision: number;
}

const EMPTY_REPOSITORY_STATE: DesktopGitRepositoryState = {
	status: null,
	loading: false,
	error: null,
	busy: null,
	processingPaths: new Set(),
	selectionTarget: null,
	selectedPaths: new Set(),
	selectionAnchor: null,
	revision: 0,
};

type RunOptions = NonNullable<
	Parameters<ReturnType<typeof useShellular>["runGitOperation"]>[2]
>;
type RunResult = Awaited<
	ReturnType<ReturnType<typeof useShellular>["runGitOperation"]>
>;

export interface DesktopGitWorkspace {
	repositories: ProjectInfo[];
	states: Record<string, DesktopGitRepositoryState>;
	totalChanges: number;
	refresh: (projectPath: string) => Promise<void>;
	refreshAll: () => Promise<void>;
	select: (
		projectPath: string,
		target: GitDiffTarget,
		filePath: string,
		orderedPaths: string[],
		mode: "replace" | "toggle" | "range",
	) => void;
	run: (
		projectPath: string,
		operation: GitOperation,
		options?: RunOptions,
	) => Promise<RunResult>;
}

export function useDesktopGitWorkspace(): DesktopGitWorkspace {
	const { connectionStatus, projects, runGitOperation } = useShellular();
	const repositories = useMemo(
		() => projects.filter((project) => project.gitInfo?.hasGit),
		[projects],
	);
	const [states, setStates] = useState<
		Record<string, DesktopGitRepositoryState>
	>({});
	const requestIds = useRef<Record<string, number>>({});

	useEffect(() => {
		const paths = new Set(repositories.map((project) => project.path));
		setStates((current) =>
			Object.fromEntries(
				repositories.map((project) => [
					project.path,
					current[project.path] ?? { ...EMPTY_REPOSITORY_STATE },
				]),
			),
		);
		for (const path of Object.keys(requestIds.current)) {
			if (!paths.has(path)) delete requestIds.current[path];
		}
	}, [repositories]);

	const refresh = useCallback(
		async (projectPath: string) => {
			if (connectionStatus !== "connected") return;
			const requestId = (requestIds.current[projectPath] ?? 0) + 1;
			requestIds.current[projectPath] = requestId;
			setStates((current) => ({
				...current,
				[projectPath]: {
					...(current[projectPath] ?? EMPTY_REPOSITORY_STATE),
					loading: true,
					error: null,
				},
			}));
			try {
				const result = await runGitOperation(projectPath, "status");
				if (requestIds.current[projectPath] !== requestId) return;
				setStates((current) => ({
					...current,
					[projectPath]: nextRepositoryStatus(
						current[projectPath] ?? EMPTY_REPOSITORY_STATE,
						result.status ?? null,
						{ loading: false, error: null },
					),
				}));
			} catch (error) {
				if (requestIds.current[projectPath] !== requestId) return;
				setStates((current) => ({
					...current,
					[projectPath]: {
						...(current[projectPath] ?? EMPTY_REPOSITORY_STATE),
						loading: false,
						error: (error as Error).message || "Failed to load Git status",
					},
				}));
			}
		},
		[connectionStatus, runGitOperation],
	);

	const refreshAll = useCallback(async () => {
		const paths = repositories.map((project) => project.path);
		for (let index = 0; index < paths.length; index += 3) {
			await Promise.all(paths.slice(index, index + 3).map(refresh));
		}
	}, [refresh, repositories]);

	const run = useCallback(
		async (
			projectPath: string,
			operation: GitOperation,
			options: RunOptions = {},
		) => {
			requestIds.current[projectPath] =
				(requestIds.current[projectPath] ?? 0) + 1;
			const processingPaths = new Set(options.files ?? []);
			setStates((current) => ({
				...current,
				[projectPath]: {
					...(current[projectPath] ?? EMPTY_REPOSITORY_STATE),
					busy: operation,
					processingPaths,
					error: null,
				},
			}));
			try {
				const result = await runGitOperation(projectPath, operation, options);
				setStates((current) => {
					const previous = current[projectPath] ?? EMPTY_REPOSITORY_STATE;
					const next = nextRepositoryStatus(
						previous,
						result.status ?? previous.status,
						{
							selectionTarget: null,
							selectedPaths: new Set(),
							selectionAnchor: null,
							error: null,
						},
					);
					return { ...current, [projectPath]: next };
				});
				if (operation !== "status" && operation !== "branches") {
					notifyGitWorktreeChanged(projectPath);
				}
				return result;
			} catch (error) {
				setStates((current) => ({
					...current,
					[projectPath]: {
						...(current[projectPath] ?? EMPTY_REPOSITORY_STATE),
						error: (error as Error).message || `Git ${operation} failed`,
					},
				}));
				throw error;
			} finally {
				setStates((current) => ({
					...current,
					[projectPath]: {
						...(current[projectPath] ?? EMPTY_REPOSITORY_STATE),
						busy: null,
						processingPaths: new Set(),
					},
				}));
			}
		},
		[runGitOperation],
	);

	const select = useCallback(
		(
			projectPath: string,
			target: GitDiffTarget,
			filePath: string,
			orderedPaths: string[],
			mode: "replace" | "toggle" | "range",
		) => {
			setStates((current) => {
				const state = current[projectPath] ?? EMPTY_REPOSITORY_STATE;
				const sameGroup = state.selectionTarget === target;
				let selectedPaths: Set<string>;
				if (mode === "toggle" && sameGroup) {
					selectedPaths = new Set(state.selectedPaths);
					if (selectedPaths.has(filePath)) selectedPaths.delete(filePath);
					else selectedPaths.add(filePath);
				} else if (mode === "range" && sameGroup && state.selectionAnchor) {
					const anchor = orderedPaths.indexOf(state.selectionAnchor);
					const currentIndex = orderedPaths.indexOf(filePath);
					selectedPaths =
						anchor >= 0 && currentIndex >= 0
							? new Set(
									orderedPaths.slice(
										Math.min(anchor, currentIndex),
										Math.max(anchor, currentIndex) + 1,
									),
								)
							: new Set([filePath]);
				} else {
					selectedPaths = new Set([filePath]);
				}
				return {
					...current,
					[projectPath]: {
						...state,
						selectionTarget: target,
						selectedPaths,
						selectionAnchor:
							mode === "range" && sameGroup ? state.selectionAnchor : filePath,
					},
				};
			});
		},
		[],
	);

	useEffect(() => {
		if (connectionStatus !== "connected") return;
		void refreshAll();
		const refreshWhenVisible = () => {
			if (document.visibilityState === "visible") void refreshAll();
		};
		const timer = window.setInterval(refreshWhenVisible, 10_000);
		window.addEventListener("focus", refreshWhenVisible);
		window.addEventListener(GIT_WORKTREE_CHANGED_EVENT, refreshWhenVisible);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("focus", refreshWhenVisible);
			window.removeEventListener(
				GIT_WORKTREE_CHANGED_EVENT,
				refreshWhenVisible,
			);
		};
	}, [connectionStatus, refreshAll]);

	const totalChanges = useMemo(
		() =>
			repositories.reduce(
				(total, project) =>
					total + (states[project.path]?.status?.files.length ?? 0),
				0,
			),
		[repositories, states],
	);

	return {
		repositories,
		states,
		totalChanges,
		refresh,
		refreshAll,
		select,
		run,
	};
}

function nextRepositoryStatus(
	previous: DesktopGitRepositoryState,
	status: GitWorkingTreeStatus | null,
	patch: Partial<DesktopGitRepositoryState>,
): DesktopGitRepositoryState {
	return {
		...previous,
		...patch,
		status,
		revision: sameGitFiles(previous.status, status)
			? previous.revision
			: previous.revision + 1,
	};
}

function sameGitFiles(
	left: GitWorkingTreeStatus | null,
	right: GitWorkingTreeStatus | null,
) {
	if (left === right) return true;
	if (!left || !right || left.files.length !== right.files.length) return false;
	return left.files.every((file, index) => {
		const other = right.files[index];
		return (
			other !== undefined &&
			file.path === other.path &&
			file.status === other.status &&
			file.indexStatus === other.indexStatus &&
			file.worktreeStatus === other.worktreeStatus &&
			file.staged === other.staged &&
			file.unstaged === other.unstaged &&
			file.untracked === other.untracked
		);
	});
}
