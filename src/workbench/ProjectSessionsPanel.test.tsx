import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockAgent {
	id: "codex" | "opencode";
	name: string;
	title: string;
	available: boolean;
	state: "ready";
}

interface MockSessionPage {
	agentAvailable: boolean;
	sessions: Array<{
		id: string;
		title: string;
		createdAt: number;
		workspacePath: string;
	}>;
	nextCursor?: string;
}

const mocks = vi.hoisted(() => ({
	agents: {} as Record<string, MockAgent>,
	tabs: [
		{
			id: "opencode-tab",
			agentId: "opencode" as const,
			sessionId: "opencode-session",
			title: "Legacy OpenCode chat",
			createdAt: 10,
			updatedAt: 20,
		},
		{
			id: "codex-tab",
			agentId: "codex" as const,
			sessionId: "codex-session",
			title: "Active Codex chat",
			createdAt: 5,
			updatedAt: 15,
		},
	],
	acpListSessions: vi.fn<
		(_agentId: MockAgent["id"]) => Promise<MockSessionPage>
	>(async () => ({ agentAvailable: true, sessions: [] })),
	openWorkbenchSurface: vi.fn(),
}));

vi.mock("state", () => ({
	useShellular: () => ({ agents: mocks.agents }),
}));
vi.mock("state/acp", () => ({
	acpListSessions: mocks.acpListSessions,
}));
vi.mock("state/chatTabs", () => ({
	useChatTabs: () => mocks.tabs,
}));
vi.mock("./store", () => ({
	openWorkbenchSurface: mocks.openWorkbenchSurface,
}));

import ProjectSessionsPanel from "./ProjectSessionsPanel";

const project = {
	name: "Shellular",
	path: "/work/shellular",
	addedAt: 1,
};

function agent(id: MockAgent["id"], title: string): MockAgent {
	return { id, name: title, title, available: true, state: "ready" };
}

beforeEach(() => {
	mocks.agents = { codex: agent("codex", "Codex") };
	mocks.tabs = [
		{
			id: "opencode-tab",
			agentId: "opencode",
			sessionId: "opencode-session",
			title: "Legacy OpenCode chat",
			createdAt: 10,
			updatedAt: 20,
		},
		{
			id: "codex-tab",
			agentId: "codex",
			sessionId: "codex-session",
			title: "Active Codex chat",
			createdAt: 5,
			updatedAt: 15,
		},
	];
	mocks.acpListSessions.mockReset();
	mocks.acpListSessions.mockResolvedValue({
		agentAvailable: true,
		sessions: [],
	});
	mocks.openWorkbenchSurface.mockClear();
});

afterEach(cleanup);

describe("ProjectSessionsPanel", () => {
	it("names failed agents without claiming there are no sessions", async () => {
		mocks.agents = {
			codex: agent("codex", "Codex"),
			opencode: agent("opencode", "OpenCode"),
		};
		mocks.tabs = [];
		mocks.acpListSessions.mockRejectedValue(
			new Error("Technical agent failure"),
		);

		render(<ProjectSessionsPanel project={project} refreshToken={0} />);

		expect(
			await screen.findByText(
				"Couldn’t load sessions from Codex and OpenCode.",
			),
		).toBeVisible();
		expect(screen.queryByText("No sessions yet")).toBeNull();
		expect(screen.queryByText(/agent requests failed/i)).toBeNull();
		expect(screen.queryByText("Technical agent failure")).toBeNull();
	});

	it("retries only failed agents while preserving and merging sessions", async () => {
		mocks.agents = {
			codex: agent("codex", "Codex"),
			opencode: agent("opencode", "OpenCode"),
		};
		mocks.tabs = [];
		let codexAttempt = 0;
		let resolveRetry: (page: MockSessionPage) => void = () => {};
		const retryPage = new Promise<MockSessionPage>((resolve) => {
			resolveRetry = resolve;
		});
		mocks.acpListSessions.mockImplementation(async (agentId) => {
			if (agentId === "codex") {
				codexAttempt++;
				if (codexAttempt === 1) throw new Error("Codex failed");
				return retryPage;
			}
			return sessionPage("opencode-session", "OpenCode session");
		});

		render(<ProjectSessionsPanel project={project} refreshToken={0} />);

		const existingSession = await screen.findByRole("button", {
			name: "Open OpenCode session with OpenCode",
		});
		expect(screen.getByRole("status")).toHaveTextContent(
			"Couldn’t load sessions from Codex. Sessions from other agents are still shown.",
		);

		mocks.acpListSessions.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
		expect(existingSession).toBeVisible();
		expect(mocks.acpListSessions).toHaveBeenCalledOnce();
		expect(mocks.acpListSessions).toHaveBeenCalledWith(
			"codex",
			project.path,
			mocks.agents.codex,
		);

		act(() => {
			resolveRetry({
				...sessionPage("codex-recovered", "Recovered Codex session"),
				nextCursor: "codex-next",
			});
		});
		expect(
			await screen.findByRole("button", {
				name: "Open Recovered Codex session with Codex",
			}),
		).toBeVisible();
		expect(existingSession).toBeVisible();
		expect(screen.queryByRole("status")).toBeNull();

		mocks.acpListSessions.mockClear();
		mocks.acpListSessions.mockResolvedValue({
			agentAvailable: true,
			sessions: [],
		});
		fireEvent.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() =>
			expect(mocks.acpListSessions).toHaveBeenCalledWith(
				"codex",
				project.path,
				mocks.agents.codex,
				"codex-next",
			),
		);
	});

	it("routes an unavailable cached agent to Manage Agents without affecting available sessions", async () => {
		render(<ProjectSessionsPanel project={project} refreshToken={0} />);

		const unavailable = await screen.findByRole("button", {
			name: "Open Manage Agents to use OpenCode session Legacy OpenCode chat",
		});
		expect(
			screen.getByText("OpenCode · Unavailable — manage agents"),
		).toBeVisible();
		expect(unavailable).toHaveClass("opacity-70");

		fireEvent.click(unavailable);
		expect(mocks.openWorkbenchSurface).toHaveBeenLastCalledWith({
			kind: "utility",
			id: "utility:manage-agents",
			page: "manage-agents",
			title: "Manage Agents",
			icon: "icon-sliders",
			showConnectionBanner: true,
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Open Active Codex chat with Codex",
			}),
		);
		expect(mocks.openWorkbenchSurface).toHaveBeenLastCalledWith({
			kind: "chat",
			id: "chat:codex:codex-session",
			title: "Active Codex chat",
			icon: "icon-codex",
			agentId: "codex",
			sessionId: "codex-session",
			workspacePath: project.path,
			createOnFirstMessage: false,
		});
	});

	it("opens the cached session normally after its agent becomes available", async () => {
		const view = render(
			<ProjectSessionsPanel project={project} refreshToken={0} />,
		);
		await screen.findByRole("button", {
			name: "Open Manage Agents to use OpenCode session Legacy OpenCode chat",
		});

		mocks.agents = {
			...mocks.agents,
			opencode: agent("opencode", "OpenCode"),
		};
		view.rerender(<ProjectSessionsPanel project={project} refreshToken={0} />);

		await waitFor(() =>
			expect(
				screen.getByRole("button", {
					name: "Open Legacy OpenCode chat with OpenCode",
				}),
			).toBeVisible(),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: "Open Legacy OpenCode chat with OpenCode",
			}),
		);

		expect(mocks.openWorkbenchSurface).toHaveBeenLastCalledWith(
			expect.objectContaining({
				kind: "chat",
				agentId: "opencode",
				sessionId: "opencode-session",
				workspacePath: project.path,
			}),
		);
	});
});

function sessionPage(id: string, title: string): MockSessionPage {
	return {
		agentAvailable: true,
		sessions: [{ id, title, createdAt: 1, workspacePath: project.path }],
	};
}
