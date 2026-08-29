import { getFileIcon } from "lib/fileIcon";
import type { GitFileStatus } from "state";
import type { EditorComparison, EditorSurface, UtilityPage } from "./types";

export const utilityMetadata: Record<
	UtilityPage,
	{ title: string; icon: string; showConnectionBanner: boolean }
> = {
	settings: {
		title: "Settings",
		icon: "icon-settings",
		showConnectionBanner: false,
	},
	ports: {
		title: "Ports",
		icon: "icon-power-cord",
		showConnectionBanner: false,
	},
	about: { title: "About", icon: "icon-info", showConnectionBanner: false },
	"reach-out": {
		title: "Reach Out",
		icon: "icon-message-circle",
		showConnectionBanner: false,
	},
	account: {
		title: "Account",
		icon: "icon-user",
		showConnectionBanner: false,
	},
	"system-monitor": {
		title: "System Monitor",
		icon: "icon-activity",
		showConnectionBanner: true,
	},
	agents: {
		title: "Agents",
		icon: "icon-ai-chat",
		showConnectionBanner: true,
	},
	"manage-agents": {
		title: "Manage Agents",
		icon: "icon-sliders",
		showConnectionBanner: true,
	},
	"bookmarked-sessions": {
		title: "Bookmarked Chats",
		icon: "icon-bookmark",
		showConnectionBanner: true,
	},
};

export function createEditorSurface(input: {
	id?: string;
	filePath: string;
	title?: string;
	gitStatus?: GitFileStatus;
	initialLine?: number;
	initialColumn?: number;
	readOnly?: boolean;
	comparison?: EditorComparison;
	gitComparison?: EditorSurface["gitComparison"];
	restorable?: boolean;
}): EditorSurface {
	const title = input.title ?? basename(input.filePath);
	return {
		kind: "editor",
		id:
			input.id ??
			(input.comparison
				? comparisonSurfaceId(input.comparison)
				: input.filePath),
		title,
		icon: getFileIcon(title || input.filePath),
		filePath: input.filePath,
		gitStatus: input.gitStatus,
		initialLine: input.initialLine,
		initialColumn: input.initialColumn,
		readOnly: input.readOnly,
		comparison: input.comparison,
		gitComparison: input.gitComparison,
		restorable: input.restorable,
	};
}

export function comparisonSurfaceId(comparison: EditorComparison) {
	switch (comparison.kind) {
		case "working-tree":
			return `git-diff:${comparison.projectPath}:${comparison.target}:${comparison.relativePath}`;
		case "commit":
			return `git-commit-diff:${comparison.projectPath}:${comparison.hash}:${comparison.relativePath}`;
		case "inline":
			return `agent-diff:${comparison.sourceId}:${comparison.relativePath}`;
	}
}

function basename(path: string) {
	return path.split("/").pop() || path;
}
