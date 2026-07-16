import "@xterm/xterm/css/xterm.css";
import browser from "bridge/browser";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useShellular } from "state";
import TerminalContainer from "tabs/terminal/TerminalContainer";
import type { WorkbenchSurface } from "./types";

const ChatPage = lazy(() => import("pages/chat"));
const SettingsPage = lazy(() => import("pages/settings"));
const PortsPage = lazy(() => import("pages/ports"));
const AboutPage = lazy(() => import("pages/about"));
const ReachOutPage = lazy(() => import("pages/reach-out"));
const AccountPage = lazy(() => import("pages/account"));
const SysmonPage = lazy(() => import("pages/sysmon"));
const FilesPage = lazy(() => import("pages/files"));
const GitPage = lazy(() => import("pages/git-client"));
const EditorPage = lazy(() => import("pages/editor"));
const SessionsPage = lazy(() => import("pages/sessions"));

export default function SurfaceRenderer({
	surface,
}: {
	surface: WorkbenchSurface;
}) {
	return (
		<Suspense fallback={<EmptyState mascot="loading" message="Loading…" />}>
			{surface.kind === "chat" && <ChatSurfaceView surface={surface} />}
			{surface.kind === "terminal" && (
				<TerminalSurfaceView terminalId={surface.terminalId} />
			)}
			{surface.kind === "utility" && <UtilitySurfaceView surface={surface} />}
			{surface.kind === "files" && (
				<FilesPage
					initialPath={surface.initialPath}
					mode={surface.mode}
					title={surface.title}
				/>
			)}
			{surface.kind === "git" && (
				<GitPage
					projectPath={surface.projectPath}
					projectName={surface.projectName}
				/>
			)}
			{surface.kind === "editor" && (
				<EditorPage
					filePath={surface.filePath}
					gitStatus={surface.gitStatus}
					initialLine={surface.initialLine}
					initialColumn={surface.initialColumn}
					readOnly={surface.readOnly}
					pageId={surface.id}
				/>
			)}
			{surface.kind === "agent-sessions" && (
				<AgentSessionsSurfaceView surface={surface} />
			)}
			{surface.kind === "browser" && <BrowserSurfaceView surface={surface} />}
		</Suspense>
	);
}

function BrowserSurfaceView({
	surface,
}: {
	surface: Extract<WorkbenchSurface, { kind: "browser" }>;
}) {
	useEffect(() => {
		void browser.open(surface.url);
	}, [surface.url]);

	return (
		<Page
			title={surface.title}
			className="browser-surface-page"
			rightSlot={
				<button
					type="button"
					className="page-header-action"
					onClick={() => void browser.open(surface.url)}
					aria-label="Open in app browser"
				>
					<span className="icon-external-link" aria-hidden="true" />
				</button>
			}
		>
			<EmptyState
				mascot="thinking"
				message={`Opened ${surface.url} in the app browser`}
			/>
		</Page>
	);
}

function AgentSessionsSurfaceView({
	surface,
}: {
	surface: Extract<WorkbenchSurface, { kind: "agent-sessions" }>;
}) {
	const { agents } = useShellular();
	const agent = agents[surface.agentId];
	if (!agent) return <EmptyState mascot="sleep" message="Agent unavailable" />;
	return (
		<SessionsPage
			backend={surface.agentId}
			agent={agent}
			workspace={surface.workspacePath}
		/>
	);
}

function ChatSurfaceView({
	surface,
}: {
	surface: Extract<WorkbenchSurface, { kind: "chat" }>;
}) {
	const { agents } = useShellular();
	const agent = agents[surface.agentId];
	const name = agent?.name ?? surface.agentId;
	return (
		<ChatPage
			chatTabId={surface.id}
			sessionId={surface.sessionId}
			title={surface.title}
			agentId={surface.agentId}
			workspacePath={surface.workspacePath}
			assistantName={name}
			agentAvailable={agent?.available ?? true}
			unavailableMessage={`${name} is not available on this device.`}
			providerName={agent?.title ?? name}
			agentCapabilities={agent?.capabilities}
			createOnFirstMessage={surface.createOnFirstMessage}
		/>
	);
}

function TerminalSurfaceView({ terminalId }: { terminalId: string }) {
	const { activeTerminals } = useShellular();
	const terminalIds = useMemo(() => [terminalId], [terminalId]);
	if (!activeTerminals.some((terminal) => terminal.terminalId === terminalId)) {
		return (
			<EmptyState mascot="sleep" message="This terminal is no longer running" />
		);
	}
	return (
		<div className="workbench-terminal">
			<TerminalContainer
				activeTerminalId={terminalId}
				terminalIds={terminalIds}
				menuItems={[]}
			/>
		</div>
	);
}

function UtilitySurfaceView({
	surface,
}: {
	surface: Extract<WorkbenchSurface, { kind: "utility" }>;
}) {
	switch (surface.page) {
		case "settings":
			return <SettingsPage />;
		case "ports":
			return <PortsPage />;
		case "about":
			return <AboutPage />;
		case "reach-out":
			return <ReachOutPage />;
		case "account":
			return <AccountPage />;
		case "system-monitor":
			return <SysmonPage />;
	}
}
