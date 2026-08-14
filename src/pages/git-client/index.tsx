import "./style.scss";
import { pushPage } from "App";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import dialog from "bridge/dialog";
import AppMenu from "components/AppMenu";
import AppSelect from "components/AppSelect";
import DiffView from "components/DiffView";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Page from "components/Page";
import { getFileIcon } from "lib/fileIcon";
import { normalizeRemoteWorkspacePath } from "lib/remotePath";
import { formatRelativeTime } from "lib/utils";
import { nanoid } from "nanoid";
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
import { buildGitChangeTree, type GitChangeTreeNode } from "./gitChangeTree";
import {
	type GitReviewComment,
	type GitReviewLocation,
	getReviewCode,
	normalizeReviewSelection,
} from "./reviewComments";

type GitTab = "changes" | "history";
type Filter = "all" | "staged" | "unstaged";
type ChangeGroup = "staged" | "unstaged";
type ChangeViewMode = "list" | "tree";

const PAGE_SIZE = 30;
const GIT_VIEW_MODE_KEY = "shellular:git-changes-view-mode";
const CHANGE_FILTER_OPTIONS = [
	{ value: "all", label: "All changes" },
	{ value: "staged", label: "Staged" },
	{ value: "unstaged", label: "Unstaged" },
];

const STATUS_LABEL: Record<GitWorkingTreeFile["status"], string> = {
	modified: "M",
	staged: "S",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "U",
	ignored: "I",
};

function getInitialChangeViewMode(): ChangeViewMode {
	try {
		const stored = localStorage.getItem(GIT_VIEW_MODE_KEY);
		if (stored === "list" || stored === "tree") return stored;
	} catch {
		// Storage can be unavailable in private or restricted web views.
	}

	return window.matchMedia?.("(max-width: 640px)").matches ? "tree" : "list";
}

function saveChangeViewMode(mode: ChangeViewMode) {
	try {
		localStorage.setItem(GIT_VIEW_MODE_KEY, mode);
	} catch {
		// The view still switches for this session when persistence is unavailable.
	}
}

interface Props {
	projectPath: string;
	projectName: string;
	initialReviewComments?: GitReviewComment[];
	onReviewDraftChange?: (comments: GitReviewComment[]) => void;
	onSubmitReview?: (comments: GitReviewComment[]) => void;
}

export default function GitClientPage({
	projectPath,
	initialReviewComments = [],
	onReviewDraftChange,
	onSubmitReview,
}: Props) {
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
	const [reviewComments, setReviewComments] = useState<GitReviewComment[]>(() =>
		initialReviewComments.map((comment) => ({ ...comment })),
	);

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
				<WorkingTreeDiffPage
					projectPath={projectPath}
					file={file}
					reviewComments={
						onSubmitReview
							? reviewComments.filter((comment) => comment.path === file.path)
							: undefined
					}
					onReviewCommentsChange={
						onSubmitReview
							? (fileComments) => {
									const next = [
										...reviewComments.filter(
											(comment) => comment.path !== file.path,
										),
										...fileComments,
									];
									setReviewComments(next);
									onReviewDraftChange?.(next);
								}
							: undefined
					}
				/>,
			);
		},
		[onReviewDraftChange, onSubmitReview, projectPath, reviewComments],
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
			title={onSubmitReview ? "Review changes" : "Git"}
			subtitle={displayPath}
			className={`git-client-page${onSubmitReview ? " git-review-page" : ""}`}
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
			{!onSubmitReview && (
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
			)}

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
					reviewMode={Boolean(onSubmitReview)}
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

			{onSubmitReview && (
				<div className="git-review-submit-bar">
					<div className="git-review-submit-copy">
						<span className="icon-message-square" aria-hidden="true" />
						{reviewComments.length ? (
							<span>
								<strong>{reviewComments.length}</strong>{" "}
								{reviewComments.length === 1 ? "comment" : "comments"} ready
							</span>
						) : (
							<span>Select lines in a changed file to comment</span>
						)}
					</div>
					<button
						type="button"
						onClick={() => onSubmitReview(reviewComments)}
						disabled={!reviewComments.length}
					>
						Add to prompt
						<span className="icon-arrow-right" aria-hidden="true" />
					</button>
				</div>
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

type RunChangeOperation = (
	op: GitOperation,
	opts?: { files?: string[]; message?: string },
) => void;

interface GitChangeFileRowProps {
	file: GitWorkingTreeFile;
	group: ChangeGroup;
	selected: boolean;
	busy: boolean;
	processing: boolean;
	treeDepth?: number;
	onToggle: (path: string) => void;
	onOpenDiff: (file: GitWorkingTreeFile) => void;
	run: RunChangeOperation;
}

function GitChangeFileRow({
	file,
	group,
	selected,
	busy,
	processing,
	treeDepth,
	onToggle,
	onOpenDiff,
	run,
}: GitChangeFileRowProps) {
	const isTreeRow = treeDepth !== undefined;
	const fileName = file.path.split(/[\\/]/).pop() || file.path;
	const treeStyle = isTreeRow
		? ({
				"--tree-indent": `${Math.min(treeDepth, 6) * 14}px`,
			} as React.CSSProperties)
		: undefined;

	const discard = async () => {
		const ok = await dialog.confirm(
			`Are you sure you want to discard all changes in "${fileName}"? This cannot be undone.`,
			"Discard Changes",
		);
		if (ok) run("discard", { files: [file.path] });
	};

	return (
		<div
			className={`git-file-row${isTreeRow ? " git-tree-file-row" : ""}`}
			data-git-status={file.status}
			role={isTreeRow ? "treeitem" : undefined}
			style={treeStyle}
		>
			<button
				type="button"
				className="git-file-check"
				data-checked={selected}
				onClick={() => onToggle(file.path)}
				aria-label={`Select ${file.path}`}
			>
				<span className="icon-check" aria-hidden="true" />
			</button>
			<button
				type="button"
				className="git-file-main"
				onClick={() => onOpenDiff(file)}
			>
				{isTreeRow ? (
					<span
						className={`git-tree-file-icon ${getFileIcon(fileName)}`}
						aria-hidden="true"
					/>
				) : (
					<span className="git-file-status">{STATUS_LABEL[file.status]}</span>
				)}
				<span className="git-file-text">
					<span className="git-file-name">{fileName}</span>
					{!isTreeRow && <span className="git-file-path">{file.path}</span>}
				</span>
				{isTreeRow && (
					<span className="git-tree-file-status">
						{STATUS_LABEL[file.status]}
					</span>
				)}
			</button>
			<div className="git-file-actions">
				{processing ? (
					<div className="git-file-spinner">
						<Loader size={14} mascot={false} />
					</div>
				) : group === "unstaged" ? (
					<>
						<button
							type="button"
							className="git-file-action-btn git-action-discard"
							onClick={discard}
							disabled={busy}
							title="Discard changes"
							aria-label={`Discard changes in ${file.path}`}
						>
							<span className="icon-trash" aria-hidden="true" />
						</button>
						<button
							type="button"
							className="git-file-action-btn git-action-stage"
							onClick={() => run("stage", { files: [file.path] })}
							disabled={busy}
							title="Stage changes"
							aria-label={`Stage ${file.path}`}
						>
							<span className="icon-plus" aria-hidden="true" />
						</button>
					</>
				) : (
					<button
						type="button"
						className="git-file-action-btn git-action-unstage"
						onClick={() => run("unstage", { files: [file.path] })}
						disabled={busy}
						title="Unstage changes"
						aria-label={`Unstage ${file.path}`}
					>
						<span className="icon-minus" aria-hidden="true" />
					</button>
				)}
			</div>
			{!isTreeRow && (
				<button
					type="button"
					className="git-file-chevron"
					onClick={() => onOpenDiff(file)}
					aria-label={`View diff for ${file.path}`}
				>
					<span className="icon-chevron-right" aria-hidden="true" />
				</button>
			)}
		</div>
	);
}

interface GitChangeTreeNodeViewProps {
	node: GitChangeTreeNode;
	depth: number;
	group: ChangeGroup;
	selected: Set<string>;
	busy: boolean;
	processingPaths: Set<string>;
	collapsed: Set<string>;
	onToggleFolder: (path: string) => void;
	onToggleFile: (path: string) => void;
	onOpenDiff: (file: GitWorkingTreeFile) => void;
	run: RunChangeOperation;
}

function GitChangeTreeNodeView({
	node,
	depth,
	group,
	selected,
	busy,
	processingPaths,
	collapsed,
	onToggleFolder,
	onToggleFile,
	onOpenDiff,
	run,
}: GitChangeTreeNodeViewProps) {
	if (node.type === "file") {
		return (
			<GitChangeFileRow
				file={node.file}
				group={group}
				selected={selected.has(node.path)}
				busy={busy}
				processing={processingPaths.has(node.path)}
				treeDepth={depth}
				onToggle={onToggleFile}
				onOpenDiff={onOpenDiff}
				run={run}
			/>
		);
	}

	const isCollapsed = collapsed.has(node.path);
	const treeStyle = {
		"--tree-indent": `${Math.min(depth, 6) * 14}px`,
	} as React.CSSProperties;

	return (
		<div className="git-tree-directory">
			<button
				type="button"
				className="git-tree-folder-row"
				onClick={() => onToggleFolder(node.path)}
				role="treeitem"
				aria-level={depth + 1}
				aria-expanded={!isCollapsed}
				aria-label={`${node.name}, ${node.fileCount} changed ${
					node.fileCount === 1 ? "file" : "files"
				}`}
				style={treeStyle}
			>
				<span
					className={`icon-chevron-right git-tree-folder-chevron${
						isCollapsed ? "" : " git-tree-folder-chevron--open"
					}`}
					aria-hidden="true"
				/>
				<span className="icon-folder git-tree-folder-icon" aria-hidden="true" />
				<span className="git-tree-folder-name">{node.name}</span>
				{isCollapsed ? (
					<span className="git-tree-folder-count">{node.fileCount}</span>
				) : null}
			</button>
			{!isCollapsed && (
				<div className="git-tree-children">
					{node.children.map((child) => (
						<GitChangeTreeNodeView
							key={`${child.type}:${child.path}`}
							node={child}
							depth={depth + 1}
							group={group}
							selected={selected}
							busy={busy}
							processingPaths={processingPaths}
							collapsed={collapsed}
							onToggleFolder={onToggleFolder}
							onToggleFile={onToggleFile}
							onOpenDiff={onOpenDiff}
							run={run}
						/>
					))}
				</div>
			)}
		</div>
	);
}

interface GitChangeFileCollectionProps {
	files: GitWorkingTreeFile[];
	group: ChangeGroup;
	viewMode: ChangeViewMode;
	selected: Set<string>;
	busy: boolean;
	processingPaths: Set<string>;
	onToggleFile: (path: string) => void;
	onOpenDiff: (file: GitWorkingTreeFile) => void;
	run: RunChangeOperation;
}

function GitChangeFileCollection({
	files,
	group,
	viewMode,
	selected,
	busy,
	processingPaths,
	onToggleFile,
	onOpenDiff,
	run,
}: GitChangeFileCollectionProps) {
	const tree = useMemo(
		() => (viewMode === "tree" ? buildGitChangeTree(files) : []),
		[files, viewMode],
	);
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

	const toggleFolder = useCallback((path: string) => {
		setCollapsed((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	if (viewMode === "list") {
		return (
			<div className="git-file-list">
				{files.map((file) => (
					<GitChangeFileRow
						key={`${group}:${file.path}`}
						file={file}
						group={group}
						selected={selected.has(file.path)}
						busy={busy}
						processing={processingPaths.has(file.path)}
						onToggle={onToggleFile}
						onOpenDiff={onOpenDiff}
						run={run}
					/>
				))}
			</div>
		);
	}

	return (
		<div
			className="git-file-list git-tree-list"
			role="tree"
			aria-label={`${group === "staged" ? "Staged changes" : "Changes"} tree`}
		>
			{tree.map((node) => (
				<GitChangeTreeNodeView
					key={`${node.type}:${node.path}`}
					node={node}
					depth={0}
					group={group}
					selected={selected}
					busy={busy}
					processingPaths={processingPaths}
					collapsed={collapsed}
					onToggleFolder={toggleFolder}
					onToggleFile={onToggleFile}
					onOpenDiff={onOpenDiff}
					run={run}
				/>
			))}
		</div>
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
	run: RunChangeOperation;
	lastOutput: string;
	processingPaths: Set<string>;
	setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
	openBranches: () => void;
	branchLoading: boolean;
	commitAndPush: () => void;
	reviewMode?: boolean;
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
	reviewMode,
}: ChangesTabProps) {
	const [viewMode, setViewMode] = useState<ChangeViewMode>(
		getInitialChangeViewMode,
	);

	const changeViewMode = useCallback((mode: ChangeViewMode) => {
		setViewMode(mode);
		saveChangeViewMode(mode);
	}, []);

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

				<div className="git-filter-row git-view-toolbar">
					<AppSelect
						value={filter}
						options={CHANGE_FILTER_OPTIONS}
						onChange={(value) => setFilter(value as Filter)}
						ariaLabel="Filter changes"
						className="git-change-filter"
						prefix={<span className="icon-filter" aria-hidden="true" />}
					/>
					<div className="git-view-switch">
						<button
							type="button"
							data-active={viewMode === "list"}
							onClick={() => changeViewMode("list")}
							aria-label="View changes as list"
							aria-pressed={viewMode === "list"}
							title="View as list"
						>
							<span className="icon-list" aria-hidden="true" />
						</button>
						<button
							type="button"
							data-active={viewMode === "tree"}
							onClick={() => changeViewMode("tree")}
							aria-label="View changes as tree"
							aria-pressed={viewMode === "tree"}
							title="View as tree"
						>
							<span className="git-tree-mode-icon" aria-hidden="true">
								<i />
								<i />
								<i />
							</span>
						</button>
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
								<GitChangeFileCollection
									files={stagedFiles}
									group="staged"
									viewMode={viewMode}
									selected={selected}
									busy={!!busy}
									processingPaths={processingPaths}
									onToggleFile={toggleFile}
									onOpenDiff={openDiff}
									run={run}
								/>
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
								<GitChangeFileCollection
									files={unstagedFiles}
									group="unstaged"
									viewMode={viewMode}
									selected={selected}
									busy={!!busy}
									processingPaths={processingPaths}
									onToggleFile={toggleFile}
									onOpenDiff={openDiff}
									run={run}
								/>
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
			{!reviewMode && (
				<CommitComposer
					busy={busy}
					canCommit={canCommit}
					message={commitMessage}
					onChange={setCommitMessage}
					onCommit={commit}
					onCommitAndPush={commitAndPush}
				/>
			)}
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
	reviewComments,
	onReviewCommentsChange,
}: {
	projectPath: string;
	file: GitWorkingTreeFile;
	reviewComments?: GitReviewComment[];
	onReviewCommentsChange?: (comments: GitReviewComment[]) => void;
}) {
	const { connectionStatus, runGitOperation } = useShellular();
	const [diff, setDiff] = useState<GitWorkingTreeFileDiff | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [comments, setComments] = useState<GitReviewComment[]>(
		() => reviewComments?.map((comment) => ({ ...comment })) ?? [],
	);
	const [selection, setSelection] = useState<SelectedLineRange | null>(null);
	const [draft, setDraft] = useState("");

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

	const reviewLocation = selection ? normalizeReviewSelection(selection) : null;
	const annotations = useMemo<DiffLineAnnotation<ReviewAnnotation>[]>(() => {
		const next: DiffLineAnnotation<ReviewAnnotation>[] = comments.map(
			(comment) => ({
				side: comment.side,
				lineNumber: comment.endLine,
				metadata: { type: "comment" as const, comment },
			}),
		);
		if (reviewLocation) {
			next.push({
				side: reviewLocation.side,
				lineNumber: reviewLocation.endLine,
				metadata: { type: "draft" as const, location: reviewLocation },
			});
		}
		return next;
	}, [comments, reviewLocation]);

	const updateComments = (next: GitReviewComment[]) => {
		setComments(next);
		onReviewCommentsChange?.(next);
	};

	const addComment = (location: GitReviewLocation) => {
		const body = draft.trim();
		if (!body || !diff) return;
		updateComments([
			...comments,
			{
				id: nanoid(),
				path: file.path,
				side: location.side,
				startLine: location.startLine,
				endLine: location.endLine,
				body,
				code: getReviewCode(diff.oldText, diff.newText, location),
			},
		]);
		setDraft("");
		setSelection(null);
	};

	const cancelDraft = () => {
		setDraft("");
		setSelection(null);
	};

	return (
		<Page
			title={file.path.split("/").pop() || file.path}
			subtitle={
				onReviewCommentsChange
					? `${file.path} · Select line numbers to comment`
					: file.path
			}
			className={`diff-page${onReviewCommentsChange ? " git-review-diff-page" : ""}`}
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
				<DiffView<ReviewAnnotation>
					path={diff.path}
					oldText={diff.oldText}
					newText={diff.newText}
					lineAnnotations={onReviewCommentsChange ? annotations : undefined}
					selectedLines={selection}
					onLineSelectionEnd={
						onReviewCommentsChange
							? (range) => {
									setDraft("");
									setSelection(range);
								}
							: undefined
					}
					renderAnnotation={(annotation) => {
						const metadata = annotation.metadata;
						return metadata.type === "draft" ? (
							<ReviewDraft
								location={metadata.location}
								value={draft}
								onChange={setDraft}
								onAdd={addComment}
								onCancel={cancelDraft}
							/>
						) : (
							<ReviewCommentCard
								comment={metadata.comment}
								onRemove={() =>
									updateComments(
										comments.filter(
											(comment) => comment.id !== metadata.comment.id,
										),
									)
								}
							/>
						);
					}}
				/>
			) : null}
		</Page>
	);
}

type ReviewAnnotation =
	| { type: "draft"; location: GitReviewLocation }
	| { type: "comment"; comment: GitReviewComment };

function ReviewDraft({
	location,
	value,
	onChange,
	onAdd,
	onCancel,
}: {
	location: GitReviewLocation;
	value: string;
	onChange: (value: string) => void;
	onAdd: (location: GitReviewLocation) => void;
	onCancel: () => void;
}) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		textareaRef.current?.focus();
	}, []);
	const side = location.side === "additions" ? "R" : "L";
	const range =
		location.startLine === location.endLine
			? `${side}${location.startLine}`
			: `${side}${location.startLine}–${side}${location.endLine}`;
	return (
		<div className="git-review-annotation git-review-draft">
			<div className="git-review-annotation-heading">
				<span className="git-review-local-mark" aria-hidden="true">
					<span className="icon-message-square" />
				</span>
				<strong>Local comment</strong>
				<span className="git-review-location">Comment on {range}</span>
			</div>
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
						event.preventDefault();
						onAdd(location);
					}
				}}
				placeholder="Request change"
				aria-label={`Comment on ${range}`}
			/>
			<div className="git-review-annotation-actions">
				<button type="button" className="git-review-cancel" onClick={onCancel}>
					Cancel
				</button>
				<button
					type="button"
					className="git-review-add"
					onClick={() => onAdd(location)}
					disabled={!value.trim()}
				>
					Comment
				</button>
			</div>
		</div>
	);
}

function ReviewCommentCard({
	comment,
	onRemove,
}: {
	comment: GitReviewComment;
	onRemove: () => void;
}) {
	const side = comment.side === "additions" ? "R" : "L";
	const range =
		comment.startLine === comment.endLine
			? `${side}${comment.startLine}`
			: `${side}${comment.startLine}–${side}${comment.endLine}`;
	return (
		<div className="git-review-annotation git-review-comment">
			<div className="git-review-annotation-heading">
				<span className="git-review-local-mark" aria-hidden="true">
					<span className="icon-message-square" />
				</span>
				<strong>Local comment</strong>
				<span className="git-review-location">Comment on {range}</span>
				<button type="button" onClick={onRemove} aria-label="Remove comment">
					<span className="icon-x" aria-hidden="true" />
				</button>
			</div>
			<p>{comment.body}</p>
		</div>
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
