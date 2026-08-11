import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChatSidebar from "./ChatSidebar";

const mocks = vi.hoisted(() => ({
	removeChatTab: vi.fn(),
	tryOpenChatSurface: vi.fn(() => true),
}));

vi.mock("state", () => ({ useShellular: () => ({ agents: {} }) }));
vi.mock("state/chatTabs", () => ({
	useChatTabs: () => [
		{
			id: "chat:one",
			agentId: "codex",
			sessionId: "session-1",
			title: "First chat",
		},
		{
			id: "chat:two",
			agentId: "codex",
			sessionId: "session-2",
			title: "Second chat",
		},
	],
	removeChatTab: mocks.removeChatTab,
}));
vi.mock("state/sessions", () => ({
	getSessionStreaming: () => false,
	listenToSessionStreamingEvent: () => () => {},
}));
vi.mock("workbench/openers", () => ({
	tryOpenChatSurface: mocks.tryOpenChatSurface,
}));

describe("ChatSidebar", () => {
	it("exposes active navigation and opens existing chats through the workbench", () => {
		const onNavigate = vi.fn();
		render(
			<ChatSidebar
				onNavigate={onNavigate}
				workspacePath="/repo"
				activeTabId="chat:one"
			/>,
		);

		expect(screen.getByRole("button", { name: /^First chat/ })).toHaveAttribute(
			"aria-current",
			"page",
		);
		fireEvent.click(screen.getByRole("button", { name: /^Second chat/ }));
		expect(onNavigate).toHaveBeenCalledOnce();
		expect(mocks.tryOpenChatSurface).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "chat:two",
				sessionId: "session-2",
				workspacePath: "/repo",
			}),
		);

		fireEvent.click(screen.getByRole("button", { name: "Close Second chat" }));
		expect(mocks.removeChatTab).toHaveBeenCalledWith("/repo", "chat:two");
	});
});
