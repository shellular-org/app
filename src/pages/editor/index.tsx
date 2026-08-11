import EmptyState from "components/EmptyState";
import { lazy, Suspense, useState } from "react";
import { isTextFilePath } from "./filePreview";
import { shouldUseMonacoEditor } from "./platform";
import type { EditorPageProps } from "./types";

const MonacoEditorPage = process.env.IS_DESKTOP_UI
	? lazy(() => import("./MonacoEditorPage"))
	: null;
const DesktopFilePreviewPage = process.env.IS_DESKTOP_UI
	? lazy(() => import("./DesktopFilePreviewPage"))
	: null;
const CodeMirrorEditorPage =
	process.env.IS_ANDROID || process.env.IS_IOS || process.env.IS_BROWSER
		? lazy(() => import("./CodeMirrorEditorPage"))
		: null;

export default function EditorPage(props: EditorPageProps) {
	const [useDesktopSuite] = useState(() => shouldUseMonacoEditor());
	const legacyGitComparison =
		props.gitComparison ??
		(props.comparison?.kind === "working-tree"
			? {
					projectPath: props.comparison.projectPath,
					relativePath: props.comparison.relativePath,
					target: props.comparison.target,
				}
			: undefined);

	return (
		<Suspense
			fallback={<EmptyState message="Loading editor…" mascot="loading" />}
		>
			{useDesktopSuite && MonacoEditorPage && isTextFilePath(props.filePath) ? (
				<MonacoEditorPage {...props} />
			) : useDesktopSuite && DesktopFilePreviewPage ? (
				<DesktopFilePreviewPage {...props} />
			) : CodeMirrorEditorPage ? (
				<CodeMirrorEditorPage
					filePath={props.filePath}
					gitStatus={props.gitStatus}
					initialLine={props.initialLine}
					initialColumn={props.initialColumn}
					readOnly={props.readOnly}
					pageId={props.pageId}
					gitComparison={legacyGitComparison}
				/>
			) : (
				<EmptyState message="Editor unavailable" mascot="thinking" />
			)}
		</Suspense>
	);
}
