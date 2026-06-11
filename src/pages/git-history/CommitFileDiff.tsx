import DiffView from "components/DiffView";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { useCallback, useEffect, useState } from "react";
import { type GitCommitFileDiff, useShellular } from "state";

interface Props {
	projectPath: string;
	hash: string;
	filePath: string;
}

export default function CommitFileDiffPage({
	projectPath,
	hash,
	filePath,
}: Props) {
	const { connectionStatus, getCommitFileDiff } = useShellular();
	const [diff, setDiff] = useState<GitCommitFileDiff | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const name = filePath.split("/").pop() || filePath;

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await getCommitFileDiff(projectPath, hash, filePath);
			setDiff(result);
		} catch (err) {
			setError((err as Error).message || "Failed to load diff");
		} finally {
			setLoading(false);
		}
	}, [getCommitFileDiff, projectPath, hash, filePath]);

	useEffect(() => {
		if (connectionStatus === "connected") {
			load();
		}
	}, [connectionStatus, load]);

	return (
		<Page title={name} subtitle={filePath} className="diff-page">
			{loading ? (
				<EmptyState message="Loading diff..." mascot="loading" />
			) : error ? (
				<EmptyState message={error} mascot="error" />
			) : diff?.binary ? (
				<EmptyState
					message="Binary file — diff not available"
					mascot="thinking"
				/>
			) : diff && diff.oldText === diff.newText ? (
				<EmptyState message="No textual changes" mascot="idle" />
			) : diff ? (
				<DiffView
					path={filePath}
					oldText={diff.oldText}
					newText={diff.newText}
				/>
			) : null}
		</Page>
	);
}
