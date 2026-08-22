import type { AiBackend } from "@shellular/protocol";
import AgentIcon from "components/AgentIcon";
import { getAgentIcon } from "lib/agents";
import { openChatPage } from "lib/navigate";
import { useEffect, useState } from "react";
import { useShellular } from "state";
import type { AcpAgentInfo } from "state/acp";
import { type ChatTab, removeChatTab, useChatTabs } from "state/chatTabs";
import {
	getSessionStreaming,
	listenToSessionStreamingEvent,
} from "state/sessions";

/**
 * Slide-in sidebar (from the right) listing the chats opened in this chat's
 * folder, cached locally in the `chatTabs` store. Selecting a chat or starting a
 * new one pushes a fresh `ChatConversationPage`. Rendered inside the chat page —
 * there is no separate workspace component.
 */
export default function ChatSidebar({
	open,
	onClose,
	workspacePath,
	activeTabId,
	currentAgentId,
}: {
	open: boolean;
	onClose: () => void;
	workspacePath: string;
	/** Local id of the chat currently being viewed, to highlight it. */
	activeTabId: string;
	/** Agent of the chat being viewed, marked in the picker as "current". */
	currentAgentId?: AiBackend;
}) {
	const { agents } = useShellular();
	const tabs = useChatTabs(workspacePath);
	const folderName =
		workspacePath.split("/").filter(Boolean).pop() || workspacePath;

	const availableAgents = Object.values(agents).filter(
		(agent) => agent.available,
	);
	const singleAgent = availableAgents.length === 1 ? availableAgents[0] : null;

	// Keep the panel mounted briefly while it animates out.
	const [mounted, setMounted] = useState(open);
	useEffect(() => {
		if (open) {
			setMounted(true);
			return;
		}
		const timer = window.setTimeout(() => setMounted(false), 220);
		return () => window.clearTimeout(timer);
	}, [open]);

	if (!mounted) return null;

	const openExisting = (tab: ChatTab) => {
		onClose();
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
		onClose();
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
		<div className={`project-chat-drawer ${open ? "is-open" : "is-closing"}`}>
			<button
				type="button"
				className="project-chat-drawer-backdrop"
				aria-label="Close chats"
				onClick={onClose}
			/>
			<aside className="project-chat-drawer-panel">
				<header className="project-chat-drawer-header">
					<div className="project-chat-drawer-title">
						<span className="icon-folder" aria-hidden="true" />
						<span>{folderName}</span>
					</div>
					<button
						type="button"
						className="project-chat-drawer-close haptic-trigger"
						onClick={onClose}
						aria-label="Close"
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</header>

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
						// One agent needs no choice, so the action is the primary button
						// and the agent is named inside it rather than picked.
						<button
							type="button"
							className="project-chat-new-btn haptic-trigger"
							onClick={() => newChat(singleAgent.id)}
						>
							<span className="icon-plus" aria-hidden="true" />
							<span>New chat with {singleAgent.title || singleAgent.name}</span>
						</button>
					) : (
						// Every agent is shown as a tappable avatar rather than hidden
						// behind a menu: the row itself is what tells you this project can
						// be opened with a different agent than the one you're in. It
						// stays one line tall and scrolls sideways if agents outgrow it.
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
											{/* The button is the only box: it holds the logo and
											    nothing else. The name lives in `aria-label` and the
											    tooltip, so screen readers keep it. */}
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
			</aside>
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
				aria-label="Close chat"
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
	openChatPage({
		agentId,
		agent,
		sessionId,
		title,
		workspacePath,
		tabId,
		createOnFirstMessage: !sessionId,
	}).catch(console.error);
}
