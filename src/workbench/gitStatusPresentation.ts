import type { GitStatusEntry } from "@pierre/trees";
import type { CSSProperties } from "react";
import type { GitFileStatus } from "state";

type TreeGitStatus = GitStatusEntry["status"];

export interface GitStatusPresentation {
	status: TreeGitStatus;
	label: string | null;
	title: string;
	color: string;
}

const PRESENTATION: Record<
	TreeGitStatus,
	Omit<GitStatusPresentation, "status">
> = {
	added: {
		label: "A",
		title: "Git status: added",
		color: "var(--success)",
	},
	deleted: {
		label: "D",
		title: "Git status: deleted",
		color: "var(--danger)",
	},
	ignored: {
		label: null,
		title: "Git status: ignored",
		color: "var(--secondary-text)",
	},
	modified: {
		label: "M",
		title: "Git status: modified",
		color: "var(--warning)",
	},
	renamed: {
		label: "R",
		title: "Git status: renamed",
		color: "var(--info)",
	},
	untracked: {
		label: "U",
		title: "Git status: untracked",
		color: "var(--success)",
	},
};

export const TREE_GIT_STATUS_STYLE = {
	"--trees-git-added-color-override": PRESENTATION.added.color,
	"--trees-git-deleted-color-override": PRESENTATION.deleted.color,
	"--trees-git-ignored-color-override": PRESENTATION.ignored.color,
	"--trees-git-modified-color-override": PRESENTATION.modified.color,
	"--trees-git-renamed-color-override": PRESENTATION.renamed.color,
	"--trees-git-untracked-color-override": PRESENTATION.untracked.color,
} as CSSProperties;

export function getGitStatusPresentation(
	status: GitFileStatus,
): GitStatusPresentation {
	const normalizedStatus: TreeGitStatus =
		status === "staged" ? "modified" : status;
	return {
		status: normalizedStatus,
		...PRESENTATION[normalizedStatus],
	};
}
