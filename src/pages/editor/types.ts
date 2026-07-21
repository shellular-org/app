import type { GitDiffTarget, GitFileStatus } from "state";
import type { EditorComparison } from "workbench/types";

export interface EditorPageProps {
	filePath: string;
	gitStatus?: GitFileStatus;
	initialLine?: number;
	initialColumn?: number;
	readOnly?: boolean;
	pageId?: string;
	comparison?: EditorComparison;
	gitComparison?: {
		projectPath: string;
		relativePath: string;
		target: GitDiffTarget;
	};
}
