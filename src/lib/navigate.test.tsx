import type { AcpAgentInfo } from "state/acp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	pushPage: vi.fn(),
	toToTab: vi.fn(),
	openInWorkbench: vi.fn(),
	tryOpenChatSurface: vi.fn(),
	tryOpenUtilitySurface: vi.fn(),
	showGitHistorySidebar: vi.fn(),
	showSessionsSidebar: vi.fn(),
}));

vi.mock("App", () => ({
	pushPage: mocks.pushPage,
	toToTab: mocks.toToTab,
}));
vi.mock("lib/agents", () => ({ getAgentIcon: () => "icon-codex" }));
vi.mock("pages/chat", () => ({ default: () => null }));
vi.mock("pages/git-client", () => ({ default: () => null }));
vi.mock("pages/ports", () => ({ default: () => null }));
vi.mock("pages/sessions", () => ({ default: () => null }));
vi.mock("pages/sysmon", () => ({ default: () => null }));
vi.mock("workbench/navigation", () => ({
	openInWorkbench: mocks.openInWorkbench,
}));
vi.mock("workbench/openers", () => ({
	tryOpenChatSurface: mocks.tryOpenChatSurface,
	tryOpenUtilitySurface: mocks.tryOpenUtilitySurface,
}));
vi.mock("workbench/secondarySidebar", () => ({
	showGitHistorySidebar: mocks.showGitHistorySidebar,
	showSessionsSidebar: mocks.showSessionsSidebar,
}));

import {
	openChatPage,
	openGitClientPage,
	openPortsPage,
	openSessionsPage,
	openSystemMonitorPage,
} from "./navigate";

const agent: AcpAgentInfo = {
	id: "codex",
	name: "codex",
	title: "Codex",
	available: true,
	state: "ready",
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("IS_DESKTOP_UI", "");
	mocks.openInWorkbench.mockReturnValue(false);
	mocks.tryOpenChatSurface.mockReturnValue(false);
	mocks.tryOpenUtilitySurface.mockReturnValue(false);
});

afterEach(() => vi.unstubAllEnvs());

describe("shared navigation", () => {
	it("opens chats in the workbench before falling back to the page stack", async () => {
		mocks.tryOpenChatSurface.mockReturnValue(true);

		await openChatPage({
			agentId: "codex",
			agent,
			sessionId: "session-1",
			title: "Review",
			workspacePath: "/repo",
			tabId: "chat:custom",
		});

		expect(mocks.tryOpenChatSurface).toHaveBeenCalledWith({
			id: "chat:custom",
			agentId: "codex",
			sessionId: "session-1",
			title: "Review",
			workspacePath: "/repo",
			createOnFirstMessage: undefined,
		});
		expect(mocks.pushPage).not.toHaveBeenCalled();
	});

	it("keeps the chat page-stack fallback on non-workbench platforms", async () => {
		await openChatPage({
			agentId: "codex",
			agent,
			sessionId: "session-1",
			title: "Review",
			workspacePath: "/repo",
			tabId: "chat:custom",
		});

		expect(mocks.pushPage).toHaveBeenCalledWith(
			"chat:custom",
			expect.objectContaining({
				props: expect.objectContaining({
					agentId: "codex",
					sessionId: "session-1",
					workspacePath: "/repo",
				}),
			}),
		);
	});

	it("uses desktop sidebars for session and Git destinations", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");

		await openSessionsPage("codex", agent);
		await openGitClientPage("/repo", "Repo");

		expect(mocks.showSessionsSidebar).toHaveBeenCalledWith({
			agentId: "codex",
		});
		expect(mocks.showGitHistorySidebar).toHaveBeenCalledWith("/repo", "Repo");
		expect(mocks.pushPage).not.toHaveBeenCalled();
	});

	it("uses workbench surfaces when desktop sidebars are not active", async () => {
		mocks.openInWorkbench.mockReturnValue(true);

		await openSessionsPage("codex", agent);
		await openGitClientPage("/repo", "Repo");

		expect(mocks.openInWorkbench).toHaveBeenNthCalledWith(1, {
			kind: "agent-sessions",
			id: "agent-sessions:codex",
			title: "Codex",
			icon: "icon-codex",
			agentId: "codex",
		});
		expect(mocks.openInWorkbench).toHaveBeenNthCalledWith(2, {
			kind: "git",
			id: "git:/repo",
			title: "Repo · Git",
			icon: "icon-git-branch",
			projectPath: "/repo",
			projectName: "Repo",
		});
	});

	it("routes utility destinations through the workbench first", async () => {
		mocks.tryOpenUtilitySurface.mockReturnValue(true);

		await openPortsPage();
		await openSystemMonitorPage();

		expect(mocks.tryOpenUtilitySurface).toHaveBeenNthCalledWith(
			1,
			"ports",
			"Ports",
			"icon-power-cord",
		);
		expect(mocks.tryOpenUtilitySurface).toHaveBeenNthCalledWith(
			2,
			"system-monitor",
			"System Monitor",
			"icon-activity",
			true,
		);
		expect(mocks.pushPage).not.toHaveBeenCalled();
	});
});
