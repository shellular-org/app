import { pushPage } from "App";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Page from "components/Page";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type GitCommit, useShellular } from "state";
import CommitDetailPage from "./CommitDetail";
import "./style.scss";

const PAGE_SIZE = 30;

interface Props {
	projectPath: string;
	projectName: string;
}

export default function GitHistoryPage({ projectPath, projectName }: Props) {
	const { connectionStatus, getGitLog } = useShellular();
	const [commits, setCommits] = useState<GitCommit[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const skipRef = useRef(0);

	const loadInitial = useCallback(async () => {
		setLoading(true);
		setError(null);
		skipRef.current = 0;
		try {
			const page = await getGitLog(projectPath, { skip: 0, limit: PAGE_SIZE });
			setCommits(page.commits);
			setHasMore(page.hasMore);
			skipRef.current = page.commits.length;
		} catch (err) {
			setError((err as Error).message || "Failed to load commit history");
		} finally {
			setLoading(false);
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
			setError((err as Error).message || "Failed to load more commits");
		} finally {
			setLoadingMore(false);
		}
	}, [getGitLog, projectPath]);

	useEffect(() => {
		if (connectionStatus === "connected") {
			loadInitial();
		}
	}, [connectionStatus, loadInitial]);

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

	return (
		<Page
			title="Git History"
			subtitle={projectName}
			className="git-history-page"
		>
			{loading ? (
				<EmptyState message="Loading commits..." mascot="loading" />
			) : error ? (
				<EmptyState message={error} mascot="error" />
			) : commits.length === 0 ? (
				<EmptyState message="No commits yet" mascot="idle" />
			) : (
				<div className="commit-list">
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
											<span className="commit-author">by {commit.author}</span>
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
			)}
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
