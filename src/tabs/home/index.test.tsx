import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	connection: {
		connectionStatus: "connected",
		transport: "remote" as "remote" | "local",
	},
	localCli: { capability: null },
	activities: [] as Array<Record<string, unknown>>,
}));

vi.mock("components/OfflineBanner", () => ({ default: () => null }));
vi.mock("components/NoticeDialog", () => ({ default: () => null }));
vi.mock("components/RatingDialog", () => ({ default: () => null }));
vi.mock("components/Scanner", () => ({ default: () => null }));
vi.mock("./ConnectionInfo", () => ({
	default: () => <section aria-label="Remote workspace" />,
}));
vi.mock("lib/notices", () => ({
	dismissNotice: vi.fn(),
	getUndismissedNotices: vi.fn(async () => []),
}));
vi.mock("lib/ratingService", () => ({
	shouldPromptForRating: vi.fn(async () => false),
}));
vi.mock("lib/utils", () => ({
	getOnlineStatus: () => true,
}));
vi.mock("state", () => ({
	useShellular: () => ({
		savedHosts: [],
		connectionStatus: "connected",
		isSwitching: false,
		agents: { codex: { available: true, title: "Codex" } },
		disconnect: vi.fn(),
	}),
}));
vi.mock("state/connection", () => ({
	getConnectionSnapshot: () => state.connection,
	getHostInfo: () => ({
		id: "host",
		hostname: "workstation",
		username: "developer",
		platform: "darwin",
		dir: "/work",
	}),
	subscribeState: () => () => undefined,
}));
vi.mock("state/localCli", () => ({
	connectLocalCli: vi.fn(),
	getLocalCliSnapshot: () => state.localCli,
	subscribeLocalCli: () => () => undefined,
}));
vi.mock("state/sessions", () => ({
	dismissSessionActivity: vi.fn(),
	getActiveSessionActivities: () => state.activities,
	subscribeSessionActivities: () => () => undefined,
}));

import HomeTab from "./index";

beforeEach(() => {
	state.connection.transport = "remote";
	state.activities = [];
	vi.stubEnv("IS_DESKTOP_UI", "true");
});

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe("Home desktop consistency", () => {
	it.each([
		["remote", "Remote workspace"],
		["local", "Local workspace"],
	] as const)("uses the shared connection inset for %s hosts", (transport, label) => {
		state.connection.transport = transport;
		render(<HomeTab />);
		expect(screen.getByLabelText(label).parentElement).toHaveClass(
			"pt-[var(--workbench-sidebar-gutter,18px)]",
		);
	});

	it("renders compact accessible session status icons instead of visible text", () => {
		state.activities = [
			{
				status: "finished",
				agentId: "codex",
				sessionId: "session-1",
				updatedAt: Date.now(),
				title: "Completed task",
				workspacePath: "/work/project",
			},
		];
		render(<HomeTab />);

		const status = screen.getByRole("img", { name: "Finished" });
		expect(status).toHaveClass("size-4", "text-success");
		expect(status).toHaveClass("pointer-events-none");
		expect(status.closest("button")).toBeNull();
		expect(status.parentElement).toHaveClass("gap-1");

		const menu = screen.getByRole("button", { name: "Session options" });
		expect(menu).toHaveClass("size-7", "cursor-pointer", "bg-surface-soft");
		expect(menu.querySelector(".icon-more-horizontal")).toHaveClass(
			"text-[14px]",
		);
		expect(screen.queryByText("Finished")).toBeNull();
	});
});
