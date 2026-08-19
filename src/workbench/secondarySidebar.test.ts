import { beforeEach, describe, expect, it } from "vitest";
import {
	backDesktopSecondarySidebar,
	closeDesktopSecondarySidebar,
	getDesktopSecondarySidebarSnapshot,
	openDesktopSecondarySidebar,
	pushDesktopSecondarySidebar,
	resetDesktopSecondarySidebar,
	showGitHistorySidebar,
	showProjectFilesSidebar,
	showSessionsSidebar,
} from "./secondarySidebar";

beforeEach(resetDesktopSecondarySidebar);

describe("desktop secondary sidebar store", () => {
	it("opens paths, navigates back, and retains the stack while closed", () => {
		showSessionsSidebar({
			agentId: "codex",
			workspacePath: "/repo",
			activeChatId: "chat:1",
		});
		expect(getDesktopSecondarySidebarSnapshot()).toMatchObject({
			open: true,
			stack: [{ view: "agents" }, { view: "sessions" }],
		});

		closeDesktopSecondarySidebar();
		expect(getDesktopSecondarySidebarSnapshot().open).toBe(false);
		expect(getDesktopSecondarySidebarSnapshot().stack).toHaveLength(2);

		openDesktopSecondarySidebar(getDesktopSecondarySidebarSnapshot().stack);
		backDesktopSecondarySidebar();
		expect(getDesktopSecondarySidebarSnapshot().stack).toEqual([
			{ view: "agents" },
		]);
	});

	it("deduplicates an existing destination instead of growing loops", () => {
		openDesktopSecondarySidebar([{ view: "agents" }]);
		pushDesktopSecondarySidebar({ view: "bookmarked-chats" });
		pushDesktopSecondarySidebar({ view: "agents" });
		expect(getDesktopSecondarySidebarSnapshot().stack).toEqual([
			{ view: "agents" },
		]);
	});

	it("replaces unrelated roots", () => {
		showSessionsSidebar({ agentId: "codex" });
		showGitHistorySidebar("/repo", "Repo");
		expect(getDesktopSecondarySidebarSnapshot().stack).toEqual([
			{
				view: "git-history",
				projectPath: "/repo",
				projectName: "Repo",
			},
		]);
	});

	it("opens project files and issues distinct search requests", () => {
		showProjectFilesSidebar("/repo", "Repo");
		expect(getDesktopSecondarySidebarSnapshot()).toMatchObject({
			open: true,
			stack: [
				{
					view: "project-files",
					projectPath: "/repo",
					projectName: "Repo",
				},
			],
		});

		showProjectFilesSidebar("/repo", "Repo", { search: true });
		const first = getDesktopSecondarySidebarSnapshot().stack[0];
		expect(first).toMatchObject({ view: "project-files" });
		if (first?.view !== "project-files")
			throw new Error("Expected files route");

		showProjectFilesSidebar("/repo", "Repo", { search: true });
		const second = getDesktopSecondarySidebarSnapshot().stack[0];
		if (second?.view !== "project-files")
			throw new Error("Expected files route");
		expect(second.searchRequest).toBeGreaterThan(first.searchRequest ?? 0);
	});
});
