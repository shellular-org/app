import { pushPage } from "App";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { getFileIcon } from "lib/fileIcon";
import { formatRelativeTime } from "lib/utils";
import { useCallback, useEffect, useState } from "react";
import { type GitCommit, type GitCommitFile, useShellular } from "state";
import CommitFileDiffPage from "./CommitFileDiff";
import "./style.scss";

const STATUS_LABEL: Record<GitCommitFile["status"], string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "U",
	staged: "S",
	ignored: "I",
};

interface Props {
	projectPath: string;
	commit: GitCommit;
}

export default function CommitDetailPage({ projectPath, commit }: Props) {
	const { connectionStatus, getCommitFiles } = useShellular();
	const [files, setFiles] = useState<GitCommitFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await getCommitFiles(projectPath, commit.hash);
			setFiles(result);
		} catch (err) {
			setError((err as Error).message || "Failed to load commit files");
		} finally {
			setLoading(false);
		}
	}, [getCommitFiles, projectPath, commit.hash]);

	useEffect(() => {
		if (connectionStatus === "connected") {
			load();
		}
	}, [connectionStatus, load]);

	const openFileDiff = useCallback(
		(file: GitCommitFile) => {
			pushPage(
				`commit-diff-${commit.hash}-${file.path}`,
				<CommitFileDiffPage
					projectPath={projectPath}
					hash={commit.hash}
					filePath={file.path}
				/>,
			);
		},
		[commit.hash, projectPath],
	);

	return (
		<Page
			title="Commit"
			subtitle={commit.shortHash}
			className="commit-detail-page"
		>
			<div className="commit-detail-header">
				<p className="commit-detail-subject">{commit.subject}</p>
				<div className="commit-detail-meta">
					<span className="commit-hash">{commit.shortHash}</span>
					<span className="commit-author">{commit.author}</span>
					<span className="commit-time">
						{formatRelativeTime(commit.timestamp * 1000)}
					</span>
				</div>
			</div>

			{loading ? (
				<EmptyState message="Loading changes..." mascot="loading" />
			) : error ? (
				<EmptyState message={error} mascot="error" />
			) : files.length === 0 ? (
				<EmptyState message="No file changes" mascot="idle" />
			) : (
				<div className="commit-file-list">
					{files.map((file) => {
						const name = file.path.split("/").pop() || file.path;
						return (
							<button
								key={file.path}
								type="button"
								className="commit-file-item"
								data-git-status={file.status}
								onClick={() => openFileDiff(file)}
							>
								<div className="commit-file-icon">
									<span className={getFileIcon(name)} aria-hidden="true" />
								</div>
								<div className="commit-file-info">
									<span className="commit-file-name">{name}</span>
									<span className="commit-file-path">{file.path}</span>
								</div>
								<span
									className="commit-file-status"
									title={file.status}
									aria-hidden="true"
								>
									{STATUS_LABEL[file.status]}
								</span>
								<span className="icon-chevron-right" aria-hidden="true" />
							</button>
						);
					})}
				</div>
			)}
		</Page>
	);
}
