import { pushPage } from "App";
import type { AiBackend } from "@shellular/protocol";
import AgentIcon from "components/AgentIcon";
import { getAgentIcon } from "lib/agents";
import { useEffect, useState } from "react";
import { useShellular } from "state";
import type { AcpAgentInfo } from "state/acp";
import { type ChatTab, removeChatTab, useChatTabs } from "state/chatTabs";
import {
	getSessionStreaming,
	listenToSessionStreamingEvent,
} from "state/sessions";
import { tryOpenChatSurface } from "workbench/openers";

/** Shared chat-navigation content. Page owns its desktop/mobile presentation. */
export default function ChatSidebar({
	onNavigate,
	workspacePath,
	activeTabId,
	currentAgentId,
}: {
	onNavigate: () => void;
	workspacePath: string;
	/** Local id of the chat currently being viewed, to highlight it. */
	activeTabId: string;
	/** Agent of the chat being viewed, marked in the picker as "current". */
	currentAgentId?: AiBackend;
}) {
	const { agents } = useShellular();
	const tabs = useChatTabs(workspacePath);

	const availableAgents = Object.values(agents).filter(
		(agent) => agent.available,
	);
	const singleAgent = availableAgents.length === 1 ? availableAgents[0] : null;

	const openExisting = (tab: ChatTab) => {
		onNavigate();
		if (tab.id === activeTabId) return;
		pushChat({
			tabId: tab.id,
			agentId: tab.agentId,
			sessionId: tab.sessionId,
			title: tab.title,
			workspacePath,
			agent: agents[tab.agentId],
		});
	};

	const newChat = (agentId: AiBackend) => {
		onNavigate();
		const tabId = `chat:new:${agentId}:${Date.now()}`;
		pushChat({
			tabId,
			agentId,
			sessionId: "",
			title: "New Chat",
			workspacePath,
			agent: agents[agentId],
		});
	};

	return (
		<div className="project-chat-navigation flex h-full min-h-0 flex-col">
			<div className="project-chat-drawer-body">
				{tabs.length === 0 && (
					<p className="project-chat-drawer-empty">No chats yet</p>
				)}
				{tabs.map((tab) => (
					<ChatTabRow
						key={tab.id}
						tab={tab}
						agent={agents[tab.agentId]}
						active={tab.id === activeTabId}
						onSelect={() => openExisting(tab)}
						onClose={() => removeChatTab(workspacePath, tab.id)}
					/>
				))}
			</div>

			<div className="project-chat-drawer-footer">
				{availableAgents.length === 0 ? (
					<p className="project-chat-drawer-empty">
						No agents available on this device
					</p>
				) : singleAgent ? (
					<button
						type="button"
						className="project-chat-new-btn haptic-trigger"
						onClick={() => newChat(singleAgent.id)}
					>
						<span className="icon-plus" aria-hidden="true" />
						<span>New chat with {singleAgent.title || singleAgent.name}</span>
					</button>
				) : (
					<>
						<span className="project-chat-new-label">
							Start a new chat with
						</span>
						<ul className="project-chat-agent-strip">
							{availableAgents.map((agent) => {
								const label = agent.title || agent.name;
								const current = agent.id === currentAgentId;
								return (
									<li key={agent.id}>
										<button
											type="button"
											className="project-chat-agent-chip haptic-trigger"
											onClick={() => newChat(agent.id)}
											aria-label={`New chat with ${label}`}
											title={label}
											data-current={current || undefined}
										>
											<AgentIcon
												agent={agent}
												className="project-chat-agent-avatar-img"
											/>
										</button>
									</li>
								);
							})}
						</ul>
					</>
				)}
			</div>
		</div>
	);
}

function ChatTabRow({
	tab,
	agent,
	active,
	onSelect,
	onClose,
}: {
	tab: ChatTab;
	agent: AcpAgentInfo | undefined;
	active: boolean;
	onSelect: () => void;
	onClose: () => void;
}) {
	const [streaming, setStreaming] = useState(() =>
		tab.sessionId ? getSessionStreaming(tab.agentId, tab.sessionId) : false,
	);
	useEffect(() => {
		if (!tab.sessionId) {
			setStreaming(false);
			return;
		}
		const refresh = () =>
			setStreaming(getSessionStreaming(tab.agentId, tab.sessionId));
		refresh();
		return listenToSessionStreamingEvent((agentId) => {
			if (agentId === tab.agentId) refresh();
		});
	}, [tab.agentId, tab.sessionId]);

	return (
		<div className="project-chat-session-row" data-active={active}>
			<button
				type="button"
				className="project-chat-session-main haptic-trigger"
				onClick={onSelect}
				aria-current={active ? "page" : undefined}
			>
				<span className="project-chat-session-icon">
					{agent ? (
						<AgentIcon agent={agent} className="" />
					) : (
						<span className={getAgentIcon(tab.agentId)} aria-hidden="true" />
					)}
				</span>
				<span className="project-chat-session-text">
					<span className="project-chat-session-title">{tab.title}</span>
					<span className="project-chat-session-meta">
						{agent?.title ?? tab.agentId}
						{!tab.sessionId ? " · draft" : ""}
					</span>
				</span>
				{streaming && <span className="badge" />}
			</button>
			<button
				type="button"
				className="project-chat-session-close haptic-trigger"
				onClick={onClose}
				aria-label={`Close ${tab.title}`}
			>
				<span className="icon-x" aria-hidden="true" />
			</button>
		</div>
	);
}

/** Push a `ChatConversationPage` for the given chat identity. */
function pushChat({
	tabId,
	agentId,
	sessionId,
	title,
	workspacePath,
	agent,
}: {
	tabId: string;
	agentId: AiBackend;
	sessionId: string;
	title: string;
	workspacePath: string;
	agent: AcpAgentInfo | undefined;
}) {
	const agentName = agent?.name ?? agentId;
	if (
		tryOpenChatSurface({
			id: tabId,
			agentId,
			sessionId,
			title,
			workspacePath,
			createOnFirstMessage: !sessionId,
		})
	)
		return;
	import("pages/chat").then((mod) => {
		const ChatConversationPage = mod.default;
		pushPage(
			tabId,
			<ChatConversationPage
				chatTabId={tabId}
				sessionId={sessionId}
				agentId={agentId}
				workspacePath={workspacePath}
				title={title}
				assistantName={agentName}
				agentAvailable={agent?.available ?? true}
				unavailableMessage={`${agentName} is not available on this device.`}
				providerName={agent?.title ?? agentName}
				agentCapabilities={agent?.capabilities}
				createOnFirstMessage={!sessionId}
			/>,
		);
	});
}
