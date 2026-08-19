import type { AppMenuItem } from "components/AppMenu";

export interface ProjectViewMenuActions {
	newChat: () => void;
	refreshSessions: () => void;
}

export function buildProjectViewMenuItems(
	actions: ProjectViewMenuActions,
): AppMenuItem[] {
	return [
		{ icon: "icon-ai-chat", label: "New Chat…", onClick: actions.newChat },
		{
			icon: "icon-refresh-cw",
			label: "Refresh Sessions",
			onClick: actions.refreshSessions,
		},
	];
}
