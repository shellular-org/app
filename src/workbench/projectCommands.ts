import type { AppMenuItem } from "components/AppMenu";
import { getAgentIcon } from "lib/agents";
import type { ProjectInfo } from "state";
import type { AcpAgentInfo } from "state/acp";
import type { WorkspaceCapabilities } from "./integration";

interface ProjectCommandHandlers {
	onNewChat(agent: AcpAgentInfo): void;
	onExplore(): void;
	onGit(): void;
	onShellularTerminal(): void;
	onRemove(): void;
	onOpenInEditor(editorId: string): void;
	onReveal(): void;
	onOpenSystemTerminal(): void;
}

export function buildProjectMenuItems(
	project: ProjectInfo,
	agents: AcpAgentInfo[],
	capabilities: WorkspaceCapabilities | null,
	handlers: ProjectCommandHandlers,
): AppMenuItem[] {
	return [
		...agents.map((agent) => ({
			icon: getAgentIcon(agent.id),
			label: `New ${agent.title || agent.name} chat`,
			onClick: () => handlers.onNewChat(agent),
		})),
		{
			icon: "icon-folder-open",
			label: "Explore",
			divider: true,
			onClick: handlers.onExplore,
		},
		...(project.gitInfo?.hasGit
			? [
					{
						icon: "icon-git-branch",
						label: "Open Git",
						onClick: handlers.onGit,
					},
				]
			: []),
		{
			icon: "icon-terminal",
			label: "Open in Shellular Terminal",
			onClick: handlers.onShellularTerminal,
		},
		...(capabilities?.localWorkspace
			? [
					...capabilities.editors.map((editor) => ({
						icon: "icon-code",
						label: `Open in ${editor.label}`,
						onClick: () => handlers.onOpenInEditor(editor.id),
					})),
					...(capabilities.canReveal
						? [
								{
									icon: "icon-folder-open",
									label: "Reveal in File Manager",
									onClick: handlers.onReveal,
								},
							]
						: []),
					...(capabilities.canOpenSystemTerminal
						? [
								{
									icon: "icon-terminal",
									label: "Open in System Terminal",
									onClick: handlers.onOpenSystemTerminal,
								},
							]
						: []),
				]
			: []),
		{
			icon: "icon-trash",
			label: "Remove",
			danger: true,
			divider: true,
			onClick: handlers.onRemove,
		},
	];
}
