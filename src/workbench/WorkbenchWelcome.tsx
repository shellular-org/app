import AgentIcon from "components/AgentIcon";
import { getAgentIcon } from "lib/agents";
import { formatRelativeTime } from "lib/utils";
import { useEffect, useId, useState } from "react";
import type { ProjectInfo } from "state";
import type { AcpAgentInfo } from "state/acp";
import { type ChatTab, getChatTabs, subscribeChatTabs } from "state/chatTabs";
import { openWorkbenchSurface } from "./store";

export interface WorkbenchWelcomeProps {
	projects: ProjectInfo[];
	agents: Record<string, AcpAgentInfo>;
	onNewChat: () => void;
	onNewTerminal: () => void;
	onOpenProject: () => void;
	onOpenSettings: () => void;
}

interface RecentWorkbenchChat extends ChatTab {
	projectPath: string;
	projectName: string;
}

export default function WorkbenchWelcome({
	projects,
	agents,
	onNewChat,
	onNewTerminal,
	onOpenProject,
	onOpenSettings,
}: WorkbenchWelcomeProps) {
	const startHeadingId = useId();
	const recentHeadingId = useId();
	const [recent, setRecent] = useState<RecentWorkbenchChat[]>([]);

	useEffect(() => {
		const refresh = () => {
			setRecent(
				projects
					.flatMap((project) =>
						getChatTabs(project.path).map((tab) => ({
							...tab,
							projectPath: project.path,
							projectName:
								project.name?.trim() ||
								basename(project.path) ||
								"Unknown project",
						})),
					)
					.sort((left, right) => right.updatedAt - left.updatedAt)
					.slice(0, 5),
			);
		};
		refresh();
		return subscribeChatTabs(refresh);
	}, [projects]);

	return (
		<div
			className="size-full overflow-y-auto text-left"
			data-testid="workbench-welcome"
		>
			<div className="mx-auto flex min-h-full w-full max-w-[840px] flex-col justify-center px-[clamp(20px,5vw,56px)] py-10">
				<div className="flex items-center gap-3">
					<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-soft text-[25px] text-accent">
						<span className="icon-shellular" aria-hidden="true" />
					</span>
					<span className="min-w-0">
						<h1 className="m-0 text-xl font-semibold tracking-[-0.02em] text-primary-text">
							Shellular
						</h1>
						<p className="m-0 mt-0.5 text-[13px] text-secondary-text">
							Start something new or continue a recent chat.
						</p>
					</span>
				</div>

				<div
					className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-8"
					data-testid="workbench-welcome-sections"
				>
					<section aria-labelledby={startHeadingId}>
						<h2
							id={startHeadingId}
							className="m-0 mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-secondary-text/70"
						>
							Start
						</h2>
						<button
							type="button"
							className="flex h-12 w-full items-center gap-3 rounded-lg bg-button-background px-4 text-left text-[13px] font-semibold text-button-text shadow-sm transition-[filter,transform] duration-100 hover:brightness-105 active:scale-[0.99] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transition-none"
							onClick={onNewChat}
						>
							<span className="icon-ai-chat text-base" aria-hidden="true" />
							<span>New Chat</span>
						</button>
						<div className="mt-2 overflow-hidden rounded-lg bg-surface-soft/50 divide-y divide-line-soft">
							<WelcomeAction
								icon="icon-terminal"
								label="New Terminal"
								onClick={onNewTerminal}
							/>
							<WelcomeAction
								icon="icon-folder"
								label="Open Project"
								onClick={onOpenProject}
							/>
							<WelcomeAction
								icon="icon-settings"
								label="Settings"
								onClick={onOpenSettings}
							/>
						</div>
					</section>

					<section aria-labelledby={recentHeadingId}>
						<h2
							id={recentHeadingId}
							className="m-0 mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-secondary-text/70"
						>
							Recent chats
						</h2>
						{recent.length > 0 ? (
							<ul className="m-0 list-none overflow-hidden rounded-lg bg-surface-soft/50 p-0 divide-y divide-line-soft">
								{recent.map((chat) => {
									const agent = agents[chat.agentId];
									const agentTitle =
										agent?.title?.trim() ||
										agent?.name?.trim() ||
										chat.agentId ||
										"Unknown agent";
									const title = chat.title.trim() || "Untitled chat";
									const relativeTime = formatRelativeTime(chat.updatedAt);
									return (
										<li key={chat.id}>
											<button
												type="button"
												className="grid min-h-14 w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-surface-soft active:bg-surface-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent motion-reduce:transition-none"
												aria-label={`Open ${title} in ${chat.projectName}, ${agentTitle}, updated ${relativeTime}`}
												onClick={() => openRecentChat(chat, title)}
											>
												<span className="grid size-8 place-items-center rounded-md bg-surface-soft text-base text-secondary-text">
													{agent ? (
														<AgentIcon
															agent={agent}
															className="size-4 object-contain"
														/>
													) : (
														<span
															className={getAgentIcon(chat.agentId)}
															aria-hidden="true"
														/>
													)}
												</span>
												<span className="flex min-w-0 flex-col gap-0.5">
													<span className="truncate text-[13px] font-semibold text-primary-text">
														{title}
													</span>
													<span className="truncate text-[11px] text-secondary-text/70">
														{agentTitle} · {chat.projectName}
													</span>
												</span>
												<time
													className="self-start whitespace-nowrap pt-0.5 text-[10px] tabular-nums text-secondary-text/60"
													dateTime={new Date(chat.updatedAt).toISOString()}
												>
													{relativeTime}
												</time>
											</button>
										</li>
									);
								})}
							</ul>
						) : (
							<div className="flex min-h-[174px] items-center justify-center rounded-lg bg-surface-soft/35 px-6 text-center">
								<span>
									<span
										className="icon-message-square mx-auto block text-xl text-secondary-text/45"
										aria-hidden="true"
									/>
									<span className="mt-2 block text-xs font-medium text-secondary-text">
										No recent chats yet
									</span>
									<span className="mt-1 block text-[11px] leading-4 text-secondary-text/60">
										Chats you start in a project will appear here.
									</span>
								</span>
							</div>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}

function WelcomeAction({
	icon,
	label,
	onClick,
}: {
	icon: string;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="flex h-10 w-full items-center gap-3 px-3 text-left text-xs font-medium text-primary-text transition-colors duration-100 hover:bg-surface-soft active:bg-surface-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent motion-reduce:transition-none"
			onClick={onClick}
		>
			<span
				className={`${icon} w-5 text-center text-sm text-secondary-text`}
				aria-hidden="true"
			/>
			<span>{label}</span>
		</button>
	);
}

function openRecentChat(chat: RecentWorkbenchChat, title: string) {
	openWorkbenchSurface({
		kind: "chat",
		id: chat.id,
		title,
		icon: getAgentIcon(chat.agentId),
		agentId: chat.agentId,
		sessionId: chat.sessionId,
		workspacePath: chat.projectPath,
		createOnFirstMessage: !chat.sessionId,
	});
}

function basename(path: string) {
	return path.split(/[\\/]/).filter(Boolean).slice(-1)[0] || path;
}
