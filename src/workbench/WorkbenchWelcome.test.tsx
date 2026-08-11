import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockChatTab {
	id: string;
	agentId: "codex" | "opencode";
	sessionId: string;
	title: string;
	createdAt: number;
	updatedAt: number;
}

const chatTabs = vi.hoisted(() => ({
	byProject: new Map<string, MockChatTab[]>(),
	listeners: new Set<() => void>(),
}));

vi.mock("state/chatTabs", () => ({
	getChatTabs: (projectPath: string) =>
		chatTabs.byProject.get(projectPath) ?? [],
	subscribeChatTabs: (listener: () => void) => {
		chatTabs.listeners.add(listener);
		return () => chatTabs.listeners.delete(listener);
	},
}));

vi.mock("lib/store", () => ({
	get: vi.fn(async () => null),
	set: vi.fn(async () => undefined),
}));

import { getWorkbenchSnapshot, resetWorkbench } from "./store";
import WorkbenchWelcome from "./WorkbenchWelcome";

const now = Date.UTC(2026, 0, 15, 12);
const projects = [
	{ path: "/work/alpha", name: "Alpha", addedAt: 1 },
	{ path: "/work/beta", name: "Beta", addedAt: 2 },
];
const agents = {
	codex: {
		id: "codex" as const,
		name: "codex",
		title: "Codex",
		available: true,
		state: "ready" as const,
	},
	opencode: {
		id: "opencode" as const,
		name: "opencode",
		title: "OpenCode",
		available: true,
		state: "ready" as const,
	},
};

function makeChat(
	id: string,
	title: string,
	updatedAt: number,
	agentId: MockChatTab["agentId"] = "codex",
): MockChatTab {
	return {
		id,
		agentId,
		sessionId: `session:${id}`,
		title,
		createdAt: updatedAt - 1_000,
		updatedAt,
	};
}

function renderWelcome(
	overrides: Partial<ComponentProps<typeof WorkbenchWelcome>> = {},
) {
	const callbacks = {
		onNewChat: vi.fn(),
		onNewTerminal: vi.fn(),
		onOpenProject: vi.fn(),
		onOpenSettings: vi.fn(),
	};
	render(
		<WorkbenchWelcome
			projects={projects}
			agents={agents}
			{...callbacks}
			{...overrides}
		/>,
	);
	return callbacks;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
	chatTabs.byProject.clear();
	chatTabs.listeners.clear();
	resetWorkbench();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("WorkbenchWelcome", () => {
	it("presents one primary action, aligned secondary actions, and an empty recent state", () => {
		const callbacks = renderWelcome();
		const newChat = screen.getByRole("button", { name: "New Chat" });
		expect(newChat).toHaveClass("bg-button-background");
		expect(screen.getByTestId("workbench-welcome-sections")).toHaveClass(
			"grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]",
		);
		expect(screen.getByText("No recent chats yet")).toBeVisible();

		fireEvent.click(newChat);
		fireEvent.click(screen.getByRole("button", { name: "New Terminal" }));
		fireEvent.click(screen.getByRole("button", { name: "Open Project" }));
		fireEvent.click(screen.getByRole("button", { name: "Settings" }));
		expect(callbacks.onNewChat).toHaveBeenCalledOnce();
		expect(callbacks.onNewTerminal).toHaveBeenCalledOnce();
		expect(callbacks.onOpenProject).toHaveBeenCalledOnce();
		expect(callbacks.onOpenSettings).toHaveBeenCalledOnce();
	});

	it("merges, sorts, and limits recent chats with clear metadata", () => {
		chatTabs.byProject.set("/work/alpha", [
			makeChat("a1", "Alpha one", now - 60_000),
			makeChat("a2", "Alpha two", now - 180_000),
			makeChat("old", "Too old", now - 900_000),
		]);
		chatTabs.byProject.set("/work/beta", [
			makeChat("b1", "Beta one", now - 120_000, "opencode"),
			makeChat("b2", "Beta two", now - 240_000),
			makeChat("b3", "Beta three", now - 300_000),
		]);
		renderWelcome();

		const recent = screen.getByRole("region", { name: "Recent chats" });
		const rows = within(recent).getAllByRole("button");
		expect(rows).toHaveLength(5);
		expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
			"Open Alpha one in Alpha, Codex, updated 1m ago",
			"Open Beta one in Beta, OpenCode, updated 2m ago",
			"Open Alpha two in Alpha, Codex, updated 3m ago",
			"Open Beta two in Beta, Codex, updated 4m ago",
			"Open Beta three in Beta, Codex, updated 5m ago",
		]);
		expect(within(recent).queryByText("Too old")).toBeNull();
		expect(within(recent).getByText("Alpha one")).toHaveClass("truncate");
		expect(within(recent).getByText("OpenCode · Beta")).toHaveClass("truncate");
		expect(within(recent).getByText("1m ago")).toBeVisible();
	});

	it("uses safe metadata fallbacks and opens the original chat surface", () => {
		const projectPath = "C:\\work\\alpha";
		chatTabs.byProject.set(projectPath, [
			makeChat("chat:one", "Continue work", now - 60_000),
		]);
		renderWelcome({
			agents: {},
			projects: [{ path: projectPath, name: "", addedAt: 1 }],
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Open Continue work in alpha, codex, updated 1m ago",
			}),
		);
		expect(getWorkbenchSnapshot().surfaces).toContainEqual(
			expect.objectContaining({
				kind: "chat",
				id: "chat:one",
				title: "Continue work",
				agentId: "codex",
				sessionId: "session:chat:one",
				workspacePath: projectPath,
			}),
		);
	});

	it("refreshes the recent list when chat tabs change", () => {
		renderWelcome();
		expect(screen.getByText("No recent chats yet")).toBeVisible();

		chatTabs.byProject.set("/work/beta", [
			makeChat("fresh", "Fresh chat", now),
		]);
		act(() => {
			for (const listener of chatTabs.listeners) listener();
		});
		expect(screen.getByText("Fresh chat")).toBeVisible();
		expect(screen.queryByText("No recent chats yet")).toBeNull();
	});
});
