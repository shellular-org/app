import { pushPage, toToTab } from "App";
import dialog from "bridge/dialog";
import AppMenu from "components/AppMenu";
import Loader from "components/Loader";
import { chatTabId } from "lib/chatTabId";
import { useCallback, useEffect, useState } from "react";
import { type ProjectInfo, useShellular } from "state";
import type { AcpAgentInfo } from "state/acp";
import { createTerminal } from "state/terminals";
import {
	type WorkspaceCapabilities,
	workspaceIntegration,
} from "workbench/integration";
import { openInWorkbench } from "workbench/navigation";
import { showGitHistorySidebar } from "workbench/secondarySidebar";
import { tryOpenChatSurface, tryOpenFileSurface } from "workbench/openers";
import { buildProjectMenuItems } from "workbench/projectCommands";

interface Props {
	projects: ProjectInfo[];
	adding?: boolean;
}

export default function ProjectList({ projects, adding }: Props) {
	const { removeProject, agents } = useShellular();
	const availableAgents = Object.values(agents).filter(
		(agent) => agent.available,
	);
	const [removingProjectPath, setRemovingProjectPath] = useState<string | null>(
		null,
	);
	const [capabilities, setCapabilities] =
		useState<WorkspaceCapabilities | null>(null);

	useEffect(() => {
		workspaceIntegration
			.capabilities()
			.then(setCapabilities)
			.catch(() => {});
	}, []);

	const handleRemoveProject = async (project: ProjectInfo) => {
		setRemovingProjectPath(project.path);
		const confirmed = await dialog.confirm(
			`Remove "${project.name}" from projects?`,
			"Remove Project",
		);
		if (confirmed) {
			try {
				await removeProject(project.path);
			} catch (error) {
				dialog.message(
					`Failed to remove project: ${(error as Error).message}`,
					"Error Removing Project",
				);
			}
		}
		setRemovingProjectPath(null);
	};

	const openNewChat = useCallback(
		async (project: ProjectInfo, agent: AcpAgentInfo) => {
			if (project.path === "/") {
				dialog.message(
					"Choose a folder inside the filesystem root. The root directory itself cannot be opened as a project.",
					"Invalid Project",
				);
				return;
			}
			const tabId = chatTabId(agent.id, "");
			if (
				tryOpenChatSurface({
					id: tabId,
					agentId: agent.id,
					sessionId: "",
					title: "New Chat",
					workspacePath: project.path,
					createOnFirstMessage: true,
				})
			)
				return;
			const ChatConversationPage = await import("pages/chat");
			pushPage(
				tabId,
				<ChatConversationPage.default
					chatTabId={tabId}
					sessionId=""
					title="New Chat"
					agentId={agent.id}
					workspacePath={project.path}
					assistantName={agent.name}
					providerName={agent.title || agent.name}
					agentCapabilities={agent?.capabilities}
					createOnFirstMessage
				/>,
			);
		},
		[],
	);

	const openGitClient = useCallback(async (project: ProjectInfo) => {
		if (process.env.IS_DESKTOP_UI) {
			showGitHistorySidebar(project.path, project.name);
			return;
		}
		if (
			openInWorkbench({
				kind: "git",
				id: `git:${project.path}`,
				title: `${project.name} · Git`,
				icon: "icon-git-branch",
				projectPath: project.path,
				projectName: project.name,
			})
		)
			return;
		const GitClientPage = await import("pages/git-client");
		pushPage(
			`git-client-${project.path}`,
			<GitClientPage.default
				projectPath={project.path}
				projectName={project.name}
			/>,
		);
	}, []);

	const openExplorer = useCallback(async (project: ProjectInfo) => {
		if (project.path === "/") {
			dialog.message(
				"Choose a folder inside the filesystem root. The root directory itself cannot be opened as a project.",
				"Invalid Project",
			);
			return;
		}
		if (
			tryOpenFileSurface({
				id: `files:${project.path}`,
				title: project.name,
				initialPath: project.path,
				mode: "project",
			})
		)
			return;
		const FileBrowserPage = await import("pages/files");
		pushPage(
			"project-explorer",
			<FileBrowserPage.default
				initialPath={project.path}
				mode="project"
				title={project.name}
			/>,
		);
	}, []);

	return (
		<div className="project-list">
			{projects.map((project) => (
				<div
					key={project.path}
					className="project-item"
					data-removing={removingProjectPath === project.path}
				>
					<button
						type="button"
						className="project-item-main"
						onClick={() => openExplorer(project)}
					>
						<div className="project-item-icon">
							<span className="icon-folder" aria-hidden="true" />
						</div>
						<div className="project-item-info">
							<span className="project-item-name">{project.name}</span>
							<span className="project-item-path">{project.path}</span>
							{project.gitInfo?.hasGit && (
								<div className="project-item-git">
									<span className="project-git-branch">
										<span className="icon-git-branch" aria-hidden="true" />
										{project.gitInfo.branch ?? "unknown"}
									</span>
									{(project.gitInfo.staged ?? 0) +
										(project.gitInfo.unstaged ?? 0) >
										0 && (
										<span className="project-git-changes">
											{(project.gitInfo.staged ?? 0) +
												(project.gitInfo.unstaged ?? 0)}{" "}
											change
											{(project.gitInfo.staged ?? 0) +
												(project.gitInfo.unstaged ?? 0) !==
											1
												? "s"
												: ""}
										</span>
									)}
									{(project.gitInfo.untracked ?? 0) > 0 && (
										<span className="project-git-untracked">
											{project.gitInfo.untracked} untracked
										</span>
									)}
								</div>
							)}
						</div>
					</button>
					<AppMenu
						buttonClassName="project-item-menu-btn"
						ariaLabel={`Menu for ${project.name}`}
						items={buildProjectMenuItems(
							project,
							availableAgents,
							capabilities,
							{
								onNewChat: (agent) => openNewChat(project, agent),
								onExplore: () => openExplorer(project),
								onGit: () => openGitClient(project),
								onShellularTerminal: async () => {
									const terminalId = await createTerminal({
										cwd: project.path,
									});
									if (
										terminalId &&
										openInWorkbench({
											kind: "terminal",
											id: `terminal:${terminalId}`,
											title: "Terminal",
											icon: "icon-terminal",
											terminalId,
										})
									)
										return;
									toToTab("terminals");
								},
								onRemove: () => handleRemoveProject(project),
								onOpenInEditor: (editorId) =>
									workspaceIntegration.openInEditor(project.path, editorId),
								onReveal: () => workspaceIntegration.reveal(project.path),
								onOpenSystemTerminal: () =>
									workspaceIntegration.openSystemTerminal(project.path),
							},
						)}
					>
						<span className="icon-more-vertical" aria-hidden="true" />
					</AppMenu>
				</div>
			))}
			{adding && (
				<div className="project-item project-item--adding">
					<div className="project-item-main">
						<div className="project-item-icon">
							<Loader size={24} />
						</div>
						<div className="project-item-info">
							<span className="project-item-name">Adding project...</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
