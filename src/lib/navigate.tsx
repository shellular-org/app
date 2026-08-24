import { pushPage, toToTab } from "App";
import type { AiBackend } from "@shellular/protocol";
import { getAgentIcon } from "lib/agents";
import { chatTabId } from "lib/chatTabId";
import type { AcpAgentInfo } from "state/acp";
import { openInWorkbench } from "workbench/navigation";
import { tryOpenChatSurface, tryOpenUtilitySurface } from "workbench/openers";
import {
	showGitHistorySidebar,
	showSessionsSidebar,
} from "workbench/secondarySidebar";

/**
 * Opening a page is not private to the component whose button does it: the
 * startup rule opens the same pages, and the chat push in particular carries
 * eleven props that have to stay in sync. These helpers are the one copy.
 */

export interface OpenChatOptions {
	agentId: AiBackend;
	/** The live agent record, when the caller has one. */
	agent?: AcpAgentInfo;
	/** ACP session id, or "" for a chat whose session is created on first send. */
	sessionId: string;
	title: string;
	workspacePath: string;
	/** Explicit page-stack id, for callers that key their own chat tabs. */
	tabId?: string;
	/** Overrides `agent.available`; the sessions list tracks its own value. */
	agentAvailable?: boolean;
	createOnFirstMessage?: boolean;
}

export async function openChatPage({
	agentId,
	agent,
	sessionId,
	title,
	workspacePath,
	tabId,
	agentAvailable,
	createOnFirstMessage,
}: OpenChatOptions): Promise<void> {
	const id = tabId ?? chatTabId(agentId, sessionId);
	if (
		tryOpenChatSurface({
			id,
			agentId,
			sessionId,
			title,
			workspacePath,
			createOnFirstMessage,
		})
	)
		return;
	const assistantName = agent?.name ?? agentId;
	const ChatConversationPage = await import("pages/chat");
	pushPage(
		id,
		<ChatConversationPage.default
			chatTabId={id}
			sessionId={sessionId}
			title={title}
			agentId={agentId}
			workspacePath={workspacePath}
			assistantName={assistantName}
			agentAvailable={agentAvailable ?? agent?.available ?? true}
			unavailableMessage={`${assistantName} is not available on this device.`}
			providerName={agent?.title || agent?.name || agentId}
			agentCapabilities={agent?.capabilities}
			createOnFirstMessage={createOnFirstMessage ?? false}
		/>,
	);
}

export async function openSessionsPage(
	backend: AiBackend,
	agent: AcpAgentInfo,
): Promise<void> {
	if (process.env.IS_DESKTOP_UI) {
		showSessionsSidebar({ agentId: backend });
		return;
	}
	if (
		openInWorkbench({
			kind: "agent-sessions",
			id: `agent-sessions:${backend}`,
			title: agent.title || agent.name,
			icon: getAgentIcon(backend),
			agentId: backend,
		})
	)
		return;
	const ChatSessionsPage = await import("pages/sessions");
	pushPage(
		`ai-${backend}`,
		<ChatSessionsPage.default backend={backend} agent={agent} />,
	);
}

export async function openGitClientPage(
	projectPath: string,
	projectName: string,
): Promise<void> {
	if (process.env.IS_DESKTOP_UI) {
		showGitHistorySidebar(projectPath, projectName);
		return;
	}
	if (
		openInWorkbench({
			kind: "git",
			id: `git:${projectPath}`,
			title: `${projectName} · Git`,
			icon: "icon-git-branch",
			projectPath,
			projectName,
		})
	)
		return;
	const GitClientPage = await import("pages/git-client");
	pushPage(
		`git-client-${projectPath}`,
		<GitClientPage.default
			projectPath={projectPath}
			projectName={projectName}
		/>,
	);
}

export async function openSystemMonitorPage(): Promise<void> {
	if (
		tryOpenUtilitySurface(
			"system-monitor",
			"System Monitor",
			"icon-activity",
			true,
		)
	)
		return;
	const SysmonPage = await import("pages/sysmon");
	pushPage("system-monitor", <SysmonPage.default />);
}

export async function openPortsPage(): Promise<void> {
	if (tryOpenUtilitySurface("ports", "Ports", "icon-power-cord")) return;
	const PortsPage = await import("pages/ports");
	pushPage("ports", <PortsPage.default />, { showConnectionBanner: false });
}

export function openTerminalTab(): void {
	toToTab("terminals");
}
