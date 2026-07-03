import "./style.scss";
import { pushPage } from "App";
import dialog from "bridge/dialog";
import AppMenu from "components/AppMenu";
import DiffView from "components/DiffView";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Page from "components/Page";
import { normalizeRemoteWorkspacePath } from "lib/remotePath";
import { formatRelativeTime } from "lib/utils";
import CommitDetailPage from "pages/git-history/CommitDetail";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type GitBranch,
	type GitCommit,
	type GitOperation,
	type GitWorkingTreeFile,
	type GitWorkingTreeFileDiff,
	type GitWorkingTreeStatus,
	useShellular,
} from "state";
import BranchPicker from "./BranchPicker";
import { type BranchActionError, getBranchActionError } from "./branchErrors";
import CommitComposer from "./CommitComposer";

type GitTab = "changes" | "history";
type Filter = "all" | "staged" | "unstaged";

const PAGE_SIZE = 30;

const STATUS_LABEL: Record<GitWorkingTreeFile["status"], string> = {
	modified: "M",
	staged: "S",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "U",
	ignored: "I",
};

interface Props {
	projectPath: string;
	projectName: string;
}

export default function GitClientPage({ projectPath }: Props) {
	const { connectionStatus, hostDir, runGitOperation, getGitLog } =
		useShellular();
	const [activeTab, setActiveTab] = useState<GitTab>("changes");
	const [status, setStatus] = useState<GitWorkingTreeStatus | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [commitMessage, setCommitMessage] = useState("");
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<GitOperation | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lastOutput, setLastOutput] = useState<string>("");
	const [processingPaths, setProcessingPaths] = useState<Set<string>>(
		new Set(),
	);
	const [showBranchModal, setShowBranchModal] = useState(false);
	const [branches, setBranches] = useState<GitBranch[]>([]);
	const [branchLoading, setBranchLoading] = useState(false);
	const [branchError, setBranchError] = useState<BranchActionError | null>(
		null,
	);
	const [activeBranchRef, setActiveBranchRef] = useState<string | null>(null);

	const [commits, setCommits] = useState<GitCommit[]>([]);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const historyLoaded = useRef(false);
	const skipRef = useRef(0);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await runGitOperation(projectPath, "status");
			setStatus(result.status ?? null);
			setSelected(new Set());
		} catch (err) {
			setError((err as Error).message || "Failed to load git status");
		} finally {
			setLoading(false);
		}
	}, [projectPath, runGitOperation]);

	const loadHistory = useCallback(async () => {
		setHistoryLoading(true);
		setHistoryError(null);
		skipRef.current = 0;
		try {
			const page = await getGitLog(projectPath, { skip: 0, limit: PAGE_SIZE });
			setCommits(page.commits);
			setHasMore(page.hasMore);
			skipRef.current = page.commits.length;
			historyLoaded.current = true;
		} catch (err) {
			setHistoryError(
				(err as Error).message || "Failed to load commit history",
			);
		} finally {
			setHistoryLoading(false);
		}
	}, [getGitLog, projectPath]);

	const loadMore = useCallback(async () => {
		setLoadingMore(true);
		try {
			const page = await getGitLog(projectPath, {
				skip: skipRef.current,
				limit: PAGE_SIZE,
			});
			setCommits((prev) => [...prev, ...page.commits]);
			setHasMore(page.hasMore);
			skipRef.current += page.commits.length;
		} catch (err) {
			setHistoryError((err as Error).message || "Failed to load more commits");
		} finally {
			setLoadingMore(false);
		}
	}, [getGitLog, projectPath]);

	useEffect(() => {
		if (connectionStatus === "connected") load();
	}, [connectionStatus, load]);

	useEffect(() => {
		if (
			activeTab === "history" &&
			connectionStatus === "connected" &&
			!historyLoaded.current
		) {
			loadHistory();
		}
	}, [activeTab, connectionStatus, loadHistory]);

	const visibleFiles = useMemo(() => {
		const files = status?.files ?? [];
		if (filter === "staged") return files.filter((file) => file.staged);
		if (filter === "unstaged") return files.filter((file) => file.unstaged);
		return files;
	}, [status, filter]);

	const selectedFiles = useMemo(
		() => visibleFiles.filter((file) => selected.has(file.path)),
		[visibleFiles, selected],
	);

	const selectedPaths = selectedFiles.map((file) => file.path);
	const canStage = selectedFiles.some((file) => file.unstaged);
	const canUnstage = selectedFiles.some((file) => file.staged);
	const canCommit = (status?.staged ?? 0) > 0;

	const run = useCallback(
		async (
			operation: GitOperation,
			options: { files?: string[]; message?: string } = {},
		) => {
			const operationFiles = options.files;
			setBusy(operation);
			setError(null);
			if (operationFiles) {
				setProcessingPaths((prev) => {
					const next = new Set(prev);
					for (const file of operationFiles) {
						next.add(file);
					}
					return next;
				});
			}
			try {
				const result = await runGitOperation(projectPath, operation, options);
				if (result.status) setStatus(result.status);
				setLastOutput(result.output ?? "");
				setSelected(new Set());
				if (operation === "commit") {
					setCommitMessage("");
					historyLoaded.current = false;
				}
			} catch (err) {
				setError((err as Error).message || `Git ${operation} failed`);
			} finally {
				setBusy(null);
				if (operationFiles) {
					setProcessingPaths((prev) => {
						const next = new Set(prev);
						for (const file of operationFiles) {
							next.delete(file);
						}
						return next;
					});
				}
			}
		},
		[projectPath, runGitOperation],
	);

	const openDiff = useCallback(
		(file: GitWorkingTreeFile) => {
			pushPage(
				`git-diff-${projectPath}-${file.path}`,
				<WorkingTreeDiffPage projectPath={projectPath} file={file} />,
			);
		},
		[projectPath],
	);

	const toggleFile = (path: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const commit = () => {
		if (!commitMessage.trim()) {
			setError("Commit message is required");
			return;
		}
		run("commit", { message: commitMessage });
	};

	const openBranches = useCallback(async () => {
		setBranchLoading(true);
		setError(null);
		setBranchError(null);
		try {
			const result = await runGitOperation(projectPath, "branches");
			setBranches(result.branches ?? []);
			setShowBranchModal(true);
		} catch (err) {
			setError((err as Error).message || "Failed to load branches");
		} finally {
			setBranchLoading(false);
		}
	}, [projectPath, runGitOperation]);

	const checkoutBranch = async (branch: GitBranch) => {
		const ok = await dialog.confirm(
			`Switch to branch "${branch.name}"?`,
			"Switch branch",
		);
		if (!ok) return;
		setBusy("checkout");
		setBranchError(null);
		setActiveBranchRef(branch.ref);
		try {
			const result = await runGitOperation(projectPath, "checkout", {
				branch: branch.ref,
			});
			if (result.status) setStatus(result.status);
			setLastOutput(result.output || "");
			setShowBranchModal(false);
		} catch (err) {
			setBranchError(
				getBranchActionError(err, `Couldn't switch to ${branch.name}`, branch),
			);
		} finally {
			setBusy(null);
			setActiveBranchRef(null);
		}
	};

	const createBranch = async (name: string) => {
		setBusy("branch-create");
		setBranchError(null);
		try {
			const result = await runGitOperation(projectPath, "branch-create", {
				branch: name,
			});
			if (result.status) setStatus(result.status);
			setLastOutput(result.output || "");
			setShowBranchModal(false);
		} catch (err) {
			setBranchError(getBranchActionError(err, "Couldn't create branch"));
		} finally {
			setBusy(null);
		}
	};

	const deleteBranch = async (branch: GitBranch, force = false) => {
		const ok = await dialog.confirm(
			force
				? `Force delete "${branch.name}"? Commits that exist only on this branch may be permanently lost.`
				: `Delete branch "${branch.name}"? Git will keep it if it contains unmerged work.`,
			force ? "Force delete branch" : "Delete branch",
		);
		if (!ok) return;
		setBusy("branch-delete");
		setBranchError(null);
		setActiveBranchRef(branch.ref);
		try {
			const result = await runGitOperation(projectPath, "branch-delete", {
				branch: branch.name,
				force,
			});
			if (result.status) setStatus(result.status);
			setLastOutput(result.output || "");
			const branchesResult = await runGitOperation(projectPath, "branches");
			setBranches(branchesResult.branches ?? []);
		} catch (err) {
			setBranchError(
				getBranchActionError(err, `Couldn't delete ${branch.name}`, branch),
			);
		} finally {
			setBusy(null);
			setActiveBranchRef(null);
		}
	};

	const commitAndPush = async () => {
		if (!commitMessage.trim()) return;
		setBusy("commit");
		try {
			const result = await runGitOperation(projectPath, "commit", {
				message: commitMessage,
			});
			setCommitMessage("");
			historyLoaded.current = false;
			const pushResult = await runGitOperation(projectPath, "push");
			if (pushResult.status) setStatus(pushResult.status);
			setLastOutput(`${result.output || ""}\n${pushResult.output || ""}`);
		} catch (err) {
			setError((err as Error).message || "Commit & Push failed");
		} finally {
			setBusy(null);
		}
	};

	const networkAction = async (operation: GitOperation) => {
		if (operation === "pull" && (status?.unstaged || status?.staged)) {
			const ok = await dialog.confirm(
				"Pull with local changes? Git may refuse if files conflict.",
				"Pull",
			);
			if (!ok) return;
		}
		run(operation);
	};

	const commitGroups = useMemo(() => groupCommitsByDate(commits), [commits]);

	const openCommit = useCallback(
		(commit: GitCommit) => {
			pushPage(
				`commit-${commit.hash}`,
				<CommitDetailPage projectPath={projectPath} commit={commit} />,
			);
		},
		[projectPath],
	);

	const totalChanges =
		(status?.staged ?? 0) + (status?.unstaged ?? 0) + (status?.untracked ?? 0);

	const displayPath = normalizeRemoteWorkspacePath(projectPath, hostDir);

	return (
		<Page
			title="Git"
			subtitle={displayPath}
			className="git-client-page"
			titleSlot={
				<span className="git-header-logo" aria-hidden="true">
					<span className="icon-git-branch" />
				</span>
			}
			rightSlot={
				<div className="git-header-actions">
					{activeTab === "changes" && (
						<AppMenu
							ariaLabel="Git Operations"
							disabled={loading || !!busy}
							buttonClassName="git-icon-btn"
							placement="bottom end"
							items={[
								{
									icon: "icon-arrow-down",
									label: "Pull",
									subText: "Fetch and merge remote changes",
									onClick: () => networkAction("pull"),
								},
								{
									icon: "icon-upload-cloud",
									label: "Push",
									subText: "Publish local commits to remote",
									onClick: () => networkAction("push"),
								},
								{
									icon: "icon-download-cloud",
									label: "Fetch",
									subText: "Get latest updates from remote",
									onClick: () => networkAction("fetch"),
								},
							]}
						>
							<span className="icon-more-vertical" aria-hidden="true" />
						</AppMenu>
					)}
					<button
						type="button"
						className="git-icon-btn"
						onClick={
							activeTab === "changes"
								? load
								: () => {
										historyLoaded.current = false;
										loadHistory();
									}
						}
						disabled={
							activeTab === "changes" ? loading || !!busy : historyLoading
						}
						aria-label="Refresh"
					>
						<span className="icon-refresh-cw" aria-hidden="true" />
					</button>
				</div>
			}
		>
			{/* Tab Switcher — matches settings page pattern */}
			<div className="git-tab-bar">
				<button
					type="button"
					className={`git-tab-item${activeTab === "changes" ? " git-tab-active" : ""}`}
					onClick={() => setActiveTab("changes")}
				>
					Changes
					{totalChanges > 0 && (
						<span className="git-tab-badge">{totalChanges}</span>
					)}
				</button>
				<button
					type="button"
					className={`git-tab-item${activeTab === "history" ? " git-tab-active" : ""}`}
					onClick={() => setActiveTab("history")}
				>
					History
				</button>
			</div>

			{activeTab === "changes" ? (
				<ChangesTab
					status={status}
					loading={loading}
					error={error}
					busy={busy}
					filter={filter}
					setFilter={setFilter}
					visibleFiles={visibleFiles}
					selected={selected}
					toggleFile={toggleFile}
					openDiff={openDiff}
					commitMessage={commitMessage}
					setCommitMessage={setCommitMessage}
					commit={commit}
					canCommit={canCommit}
					canStage={canStage}
					canUnstage={canUnstage}
					selectedPaths={selectedPaths}
					run={run}
					lastOutput={lastOutput}
					processingPaths={processingPaths}
					setSelected={setSelected}
					openBranches={openBranches}
					branchLoading={branchLoading}
					commitAndPush={commitAndPush}
				/>
			) : (
				<HistoryTab
					loading={historyLoading}
					error={historyError}
					commits={commits}
					commitGroups={commitGroups}
					hasMore={hasMore}
					loadingMore={loadingMore}
					loadMore={loadMore}
					openCommit={openCommit}
				/>
			)}

			{showBranchModal && (
				<BranchPicker
					activeBranchRef={activeBranchRef}
					branches={branches}
					busy={busy}
					error={branchError}
					onClose={() => setShowBranchModal(false)}
					onCreate={createBranch}
					onDelete={deleteBranch}
					onDismissError={() => setBranchError(null)}
					onSelect={checkoutBranch}
				/>
			)}
		</Page>
	);
}

interface ChangesTabProps {
	status: GitWorkingTreeStatus | null;
	loading: boolean;
	error: string | null;
	busy: GitOperation | null;
	filter: Filter;
	setFilter: (f: Filter) => void;
	visibleFiles: GitWorkingTreeFile[];
	selected: Set<string>;
	toggleFile: (path: string) => void;
	openDiff: (file: GitWorkingTreeFile) => void;
	commitMessage: string;
	setCommitMessage: (msg: string) => void;
	commit: () => void;
	canCommit: boolean;
	canStage: boolean;
	canUnstage: boolean;
	selectedPaths: string[];
	run: (
		op: GitOperation,
		opts?: { files?: string[]; message?: string },
	) => void;
	lastOutput: string;
	processingPaths: Set<string>;
	setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
	openBranches: () => void;
	branchLoading: boolean;
	commitAndPush: () => void;
}

function ChangesTab({
	status,
	loading,
	error,
	busy,
	filter,
	setFilter,
	visibleFiles,
	selected,
	toggleFile,
	openDiff,
	commitMessage,
	setCommitMessage,
	commit,
	canCommit,
	canStage,
	canUnstage,
	selectedPaths,
	run,
	lastOutput,
	processingPaths,
	setSelected,
	openBranches,
	branchLoading,
	commitAndPush,
}: ChangesTabProps) {
	if (loading) {
		return <EmptyState message="Loading repository..." mascot="loading" />;
	}
	if (error && !status) {
		return <EmptyState message={error} mascot="error" />;
	}
	if (!status?.hasGit) {
		return <EmptyState message="Not a git repository" mascot="thinking" />;
	}

	// A file can be in both groups (partially staged: staged hunks + new edits),
	// so it may render under both "Staged" and "Changes" — matching VS Code.
	const stagedFiles =
		filter === "unstaged" ? [] : visibleFiles.filter((f) => f.staged);
	const unstagedFiles =
		filter === "staged" ? [] : visibleFiles.filter((f) => f.unstaged);

	const handleStageGroup = () => {
		const files = unstagedFiles.map((f) => f.path);
		if (files.length > 0) run("stage", { files });
	};

	const handleUnstageGroup = () => {
		const files = stagedFiles.map((f) => f.path);
		if (files.length > 0) run("unstage", { files });
	};

	const selectGroup = (files: GitWorkingTreeFile[]) => {
		setSelected((prev) => {
			const next = new Set(prev);
			const allSelected = files.every((f) => next.has(f.path));
			for (const f of files) {
				if (allSelected) next.delete(f.path);
				else next.add(f.path);
			}
			return next;
		});
	};

	const handleDiscard = async (file: GitWorkingTreeFile) => {
		const name = file.path.split("/").pop() || file.path;
		const ok = await dialog.confirm(
			`Are you sure you want to discard all changes in "${name}"? This cannot be undone.`,
			"Discard Changes",
		);
		if (ok) {
			run("discard", { files: [file.path] });
		}
	};

	const renderFile = (
		file: GitWorkingTreeFile,
		group: "staged" | "unstaged",
	) => (
		<div
			key={`${group}:${file.path}`}
			className="git-file-row"
			data-git-status={file.status}
		>
			<button
				type="button"
				className="git-file-check"
				data-checked={selected.has(file.path)}
				onClick={() => toggleFile(file.path)}
				aria-label={`Select ${file.path}`}
			>
				<span className="icon-check" aria-hidden="true" />
			</button>
			<button
				type="button"
				className="git-file-main"
				onClick={() => openDiff(file)}
			>
				<span className="git-file-status">{STATUS_LABEL[file.status]}</span>
				<span className="git-file-text">
					<span className="git-file-name">
						{file.path.split("/").pop() || file.path}
					</span>
					<span className="git-file-path">{file.path}</span>
				</span>
			</button>
			<div className="git-file-actions">
				{processingPaths.has(file.path) ? (
					<div className="git-file-spinner">
						<Loader size={14} mascot={false} />
					</div>
				) : group === "unstaged" ? (
					<>
						<button
							type="button"
							className="git-file-action-btn git-action-discard"
							onClick={(e) => {
								e.stopPropagation();
								handleDiscard(file);
							}}
							disabled={!!busy}
							title="Discard changes"
						>
							<span className="icon-trash" aria-hidden="true" />
						</button>
						<button
							type="button"
							className="git-file-action-btn git-action-stage"
							onClick={(e) => {
								e.stopPropagation();
								run("stage", { files: [file.path] });
							}}
							disabled={!!busy}
							title="Stage changes"
						>
							<span className="icon-plus" aria-hidden="true" />
						</button>
					</>
				) : (
					<button
						type="button"
						className="git-file-action-btn git-action-unstage"
						onClick={(e) => {
							e.stopPropagation();
							run("unstage", { files: [file.path] });
						}}
						disabled={!!busy}
						title="Unstage changes"
					>
						<span className="icon-minus" aria-hidden="true" />
					</button>
				)}
			</div>
			<button
				type="button"
				className="git-file-chevron"
				onClick={() => openDiff(file)}
				aria-label="View diff"
			>
				<span className="icon-chevron-right" aria-hidden="true" />
			</button>
		</div>
	);

	return (
		<div className="git-changes-container">
			<div className="git-changes-scrollable">
				<div className="git-branch-block">
					<span
						className="git-branch-icon icon-git-branch"
						aria-hidden="true"
					/>
					<div className="git-branch-info">
						<div className="git-branch-name">{status.branch ?? "HEAD"}</div>
						<div className="git-branch-meta">
							{status.upstream || "No upstream"}
							{status.ahead > 0 && ` · ${status.ahead} ahead`}
							{status.behind > 0 && ` · ${status.behind} behind`}
						</div>
					</div>
					<button
						type="button"
						className="git-summary-branch-btn"
						onClick={openBranches}
						disabled={branchLoading || !!busy}
					>
						{branchLoading ? (
							<Loader size={12} mascot={false} />
						) : (
							<>
								<span className="icon-repeat" aria-hidden="true" />
								Switch
							</>
						)}
					</button>
				</div>

				{error && <div className="git-error">{error}</div>}
				{lastOutput && <pre className="git-output">{lastOutput}</pre>}

				<div className="git-filter-row">
					<div
						className="git-filter-tabs"
						role="tablist"
						aria-label="Change filter"
					>
						{(["all", "staged", "unstaged"] as Filter[]).map((item) => (
							<button
								key={item}
								type="button"
								role="tab"
								aria-selected={filter === item}
								data-active={filter === item}
								onClick={() => setFilter(item)}
							>
								{item}
							</button>
						))}
					</div>
				</div>

				{visibleFiles.length === 0 ? (
					<EmptyState message="No changes" mascot="idle" />
				) : (
					<>
						{stagedFiles.length > 0 && (
							<section className="git-change-group">
								<div className="git-group-header">
									<button
										type="button"
										className="git-group-title"
										onClick={() => selectGroup(stagedFiles)}
										aria-label="Select all staged changes"
									>
										<span className="git-group-name">Staged Changes</span>
										<span className="git-group-count">
											{stagedFiles.length}
										</span>
									</button>
									<button
										type="button"
										className="git-group-action git-group-action--unstage"
										onClick={handleUnstageGroup}
										disabled={!!busy}
									>
										<span className="icon-minus" aria-hidden="true" />
										Unstage all
									</button>
								</div>
								<div className="git-file-list">
									{stagedFiles.map((file) => renderFile(file, "staged"))}
								</div>
							</section>
						)}

						{unstagedFiles.length > 0 && (
							<section className="git-change-group">
								<div className="git-group-header">
									<button
										type="button"
										className="git-group-title"
										onClick={() => selectGroup(unstagedFiles)}
										aria-label="Select all changes"
									>
										<span className="git-group-name">Changes</span>
										<span className="git-group-count">
											{unstagedFiles.length}
										</span>
									</button>
									<button
										type="button"
										className="git-group-action git-group-action--stage"
										onClick={handleStageGroup}
										disabled={!!busy}
									>
										<span className="icon-plus" aria-hidden="true" />
										Stage all
									</button>
								</div>
								<div className="git-file-list">
									{unstagedFiles.map((file) => renderFile(file, "unstaged"))}
								</div>
							</section>
						)}
					</>
				)}
			</div>

			{selected.size > 0 && (
				<div className="git-floating-action-pill">
					<button
						type="button"
						className="git-pill-close"
						onClick={() => setSelected(new Set())}
						aria-label="Clear selection"
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
					<span className="git-pill-count">{selected.size} selected</span>
					<div className="git-pill-actions">
						{canStage && (
							<button
								type="button"
								className="git-pill-btn git-btn-stage"
								onClick={() => run("stage", { files: selectedPaths })}
								disabled={!!busy}
							>
								<span className="icon-plus" aria-hidden="true" />
								Stage
							</button>
						)}
						{canUnstage && (
							<button
								type="button"
								className="git-pill-btn git-btn-unstage"
								onClick={() => run("unstage", { files: selectedPaths })}
								disabled={!!busy}
							>
								<span className="icon-minus" aria-hidden="true" />
								Unstage
							</button>
						)}
					</div>
				</div>
			)}
			<CommitComposer
				busy={busy}
				canCommit={canCommit}
				message={commitMessage}
				onChange={setCommitMessage}
				onCommit={commit}
				onCommitAndPush={commitAndPush}
			/>
		</div>
	);
}

interface HistoryTabProps {
	loading: boolean;
	error: string | null;
	commits: GitCommit[];
	commitGroups: { label: string; commits: GitCommit[] }[];
	hasMore: boolean;
	loadingMore: boolean;
	loadMore: () => void;
	openCommit: (commit: GitCommit) => void;
}

function HistoryTab({
	loading,
	error,
	commits,
	commitGroups,
	hasMore,
	loadingMore,
	loadMore,
	openCommit,
}: HistoryTabProps) {
	if (loading) {
		return <EmptyState message="Loading commits..." mascot="loading" />;
	}
	if (error) {
		return <EmptyState message={error} mascot="error" />;
	}
	if (commits.length === 0) {
		return <EmptyState message="No commits yet" mascot="idle" />;
	}

	return (
		<div className="git-history-list">
			{commitGroups.map((group) => (
				<div key={group.label} className="commit-date-group">
					<h3 className="commit-date-label">{group.label}</h3>
					{group.commits.map((commit) => (
						<button
							key={commit.hash}
							type="button"
							className="commit-item"
							onClick={() => openCommit(commit)}
						>
							<div className="commit-item-icon">
								<span className="icon-git-commit" aria-hidden="true" />
							</div>
							<div className="commit-item-info">
								<span className="commit-subject">{commit.subject}</span>
								<span className="commit-meta">
									<span className="commit-hash">{commit.shortHash}</span>
									<span className="commit-author">{commit.author}</span>
									<span className="commit-time">
										{formatRelativeTime(commit.timestamp * 1000)}
									</span>
								</span>
							</div>
							<span className="icon-chevron-right" aria-hidden="true" />
						</button>
					))}
				</div>
			))}
			{hasMore && (
				<button
					type="button"
					className="commit-load-more"
					onClick={loadMore}
					disabled={loadingMore}
				>
					{loadingMore ? <Loader size={20} mascot={false} /> : "Load more"}
				</button>
			)}
		</div>
	);
}

function WorkingTreeDiffPage({
	projectPath,
	file,
}: {
	projectPath: string;
	file: GitWorkingTreeFile;
}) {
	const { connectionStatus, runGitOperation } = useShellular();
	const [diff, setDiff] = useState<GitWorkingTreeFileDiff | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await runGitOperation(projectPath, "diff", {
				file: file.path,
			});
			setDiff(result.diff ?? null);
		} catch (err) {
			setError((err as Error).message || "Failed to load diff");
		} finally {
			setLoading(false);
		}
	}, [file.path, projectPath, runGitOperation]);

	useEffect(() => {
		if (connectionStatus === "connected") load();
	}, [connectionStatus, load]);

	return (
		<Page
			title={file.path.split("/").pop() || file.path}
			subtitle={file.path}
			className="diff-page"
		>
			{loading ? (
				<EmptyState message="Loading diff..." mascot="loading" />
			) : error ? (
				<EmptyState message={error} mascot="error" />
			) : diff?.binary ? (
				<EmptyState
					message="Binary file diff not available"
					mascot="thinking"
				/>
			) : diff && diff.oldText === diff.newText ? (
				<EmptyState message="No textual changes" mascot="idle" />
			) : diff ? (
				<DiffView
					path={diff.path}
					oldText={diff.oldText}
					newText={diff.newText}
				/>
			) : null}
		</Page>
	);
}

function groupCommitsByDate(commits: GitCommit[]) {
	const groups: { label: string; commits: GitCommit[] }[] = [];
	const labelToGroup = new Map<string, (typeof groups)[number]>();

	for (const commit of commits) {
		const label = getDateGroupLabel(commit.timestamp * 1000);
		const existing = labelToGroup.get(label);
		if (existing) {
			existing.commits.push(commit);
			continue;
		}

		const group = { label, commits: [commit] };
		groups.push(group);
		labelToGroup.set(label, group);
	}

	return groups;
}

function getDateGroupLabel(timestamp?: number) {
	if (!timestamp) return "Earlier";

	const date = new Date(timestamp);
	const today = new Date();
	const startOfToday = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	).getTime();
	const startOfDate = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	).getTime();
	const diffDays = Math.round((startOfToday - startOfDate) / 86_400_000);

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays > 1 && diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: today.getFullYear() === date.getFullYear() ? undefined : "numeric",
	});
}
