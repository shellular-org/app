import type { AppMenuItem } from "components/AppMenu";
import type { ProjectPaneMode } from "./projectLayout";

export interface ProjectViewMenuActions {
	newFile: () => void;
	newFolder: () => void;
	searchTree: () => void;
	refreshTree: () => void;
	newChat: () => void;
	refreshSessions: () => void;
}

export function buildProjectViewMenuItems(
	mode: ProjectPaneMode,
	actions: ProjectViewMenuActions,
): AppMenuItem[] {
	if (mode === "tree") {
		return [
			{ icon: "icon-file-plus", label: "New File", onClick: actions.newFile },
			{
				icon: "icon-folder-plus",
				label: "New Folder",
				onClick: actions.newFolder,
			},
			{
				icon: "icon-search",
				label: "Search Files…",
				onClick: actions.searchTree,
			},
			{
				icon: "icon-refresh-cw",
				label: "Refresh Explorer",
				onClick: actions.refreshTree,
			},
		];
	}
	return [
		{ icon: "icon-ai-chat", label: "New Chat…", onClick: actions.newChat },
		{
			icon: "icon-refresh-cw",
			label: "Refresh Sessions",
			onClick: actions.refreshSessions,
		},
	];
}
