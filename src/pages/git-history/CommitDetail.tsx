import { pushPage } from "App";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { getFileIcon } from "lib/fileIcon";
import { formatRelativeTime } from "lib/utils";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { type GitCommit, type GitCommitFile, useShellular } from "state";
import { openWorkbenchSurface } from "workbench/store";
import { createEditorSurface } from "workbench/surfaces";
import "./style.scss";

const CommitFileDiffPage = process.env.IS_DESKTOP_UI
	? null
	: lazy(() => import("./CommitFileDiff"));

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
	onNavigate?: () => void;
}

export default function CommitDetailPage({ projectPath, commit }: Props) {
	return (
		<Page
			title="Commit"
			subtitle={commit.shortHash}
			className="commit-detail-page"
		>
			<CommitDetailContent projectPath={projectPath} commit={commit} />
		</Page>
	);
}

export function CommitDetailContent({
	projectPath,
	commit,
	onNavigate,
}: Props) {
	const { connectionStatus, getCommitFiles } = useShellular();
	const [files, setFiles] = useState<GitCommitFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const loadRevisionRef = useRef(0);

	const load = useCallback(async () => {
		const revision = ++loadRevisionRef.current;
		setLoading(true);
		setError(null);
		try {
			const result = await getCommitFiles(projectPath, commit.hash);
			if (revision !== loadRevisionRef.current) return;
			setFiles(result);
		} catch (err) {
			if (revision !== loadRevisionRef.current) return;
			setError((err as Error).message || "Failed to load commit files");
		} finally {
			if (revision === loadRevisionRef.current) setLoading(false);
		}
	}, [getCommitFiles, projectPath, commit.hash]);

	useEffect(() => {
		if (connectionStatus === "connected") {
			void load();
		}
		return () => {
			loadRevisionRef.current += 1;
		};
	}, [connectionStatus, load]);

	const openFileDiff = useCallback(
		(file: GitCommitFile) => {
			if (process.env.IS_DESKTOP_UI) {
				const filePath = `${projectPath.replace(/\/$/, "")}/${file.path}`;
				openWorkbenchSurface(
					createEditorSurface({
						filePath,
						comparison: {
							kind: "commit",
							projectPath,
							hash: commit.hash,
							relativePath: file.path,
						},
					}),
				);
				onNavigate?.();
				return;
			}
			if (!CommitFileDiffPage) return;
			pushPage(
				`commit-diff-${commit.hash}-${file.path}`,
				<Suspense fallback={null}>
					<CommitFileDiffPage
						projectPath={projectPath}
						hash={commit.hash}
						filePath={file.path}
					/>
				</Suspense>,
			);
			onNavigate?.();
		},
		[commit.hash, onNavigate, projectPath],
	);

	return (
		<div className="commit-detail-content">
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
				<EmptyState
					message={error}
					mascot="error"
					action={
						<button
							type="button"
							className="mt-3 rounded-md border border-card-border bg-surface-soft px-3 py-2 text-xs text-primary-text hover:bg-secondary"
							onClick={() => void load()}
						>
							Retry
						</button>
					}
				/>
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
		</div>
	);
}
