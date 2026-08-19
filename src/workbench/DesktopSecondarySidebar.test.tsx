import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import type { GitWorkingTreeStatus } from "state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopGitWorkspace } from "./gitWorkspace";

const projectTreeProps = vi.hoisted(() => vi.fn());
const refreshProjectExplorer = vi.hoisted(() => vi.fn());
const refreshGit = vi.hoisted(() => vi.fn(() => Promise.resolve()));

const repoGitStatus: GitWorkingTreeStatus = {
	hasGit: true,
	root: "/repo",
	ahead: 0,
	behind: 0,
	staged: 0,
	unstaged: 1,
	untracked: 0,
	files: [],
};
const otherGitStatus: GitWorkingTreeStatus = {
	...repoGitStatus,
	root: "/other",
	unstaged: 0,
	untracked: 1,
};
const gitStates: DesktopGitWorkspace["states"] = {
	"/repo": repositoryState(repoGitStatus),
	"/other": repositoryState(otherGitStatus),
};

vi.mock("state", () => ({
	useShellular: () => ({
		agents: {},
		projects: [
			{ path: "/repo", name: "Repo", addedAt: 1 },
			{ path: "/other", name: "Other", addedAt: 2 },
		],
	}),
}));
vi.mock("tabs/agents", () => ({
	default: () => (
		<label>
			Agent filter
			<input aria-label="Agent filter" />
		</label>
	),
}));
vi.mock("pages/bookmark-sessions", () => ({
	default: () => <div>Bookmarks</div>,
}));
vi.mock("./ProjectExplorerTree", () => ({
	default: (props: {
		project: { path: string; name: string };
		refreshToken: number;
		searchToken: number;
		gitStatus?: GitWorkingTreeStatus | null;
		onNavigate: () => void;
	}) => {
		projectTreeProps(props);
		return (
			<button type="button" onClick={props.onNavigate}>
				Open project file
			</button>
		);
	},
}));
vi.mock("./projectTreeWorkspace", () => ({ refreshProjectExplorer }));
vi.mock("pages/sessions", () => ({ default: () => <div>Sessions</div> }));
vi.mock("pages/git-history", () => ({ default: () => <div>History</div> }));
vi.mock("pages/git-history/CommitDetail", () => ({
	CommitDetailContent: () => <div>Commit</div>,
}));

import DesktopSecondarySidebar from "./DesktopSecondarySidebar";
import {
	closeDesktopSecondarySidebar,
	openDesktopSecondarySidebar,
	pushDesktopSecondarySidebar,
	resetDesktopSecondarySidebar,
} from "./secondarySidebar";

beforeEach(() => {
	resetDesktopSecondarySidebar();
	projectTreeProps.mockClear();
	refreshProjectExplorer.mockClear();
	refreshGit.mockClear();
});

afterEach(cleanup);

describe("DesktopSecondarySidebar", () => {
	it("keeps previous pages mounted and restores their state on Back", () => {
		render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() => openDesktopSecondarySidebar([{ view: "agents" }]));
		const filter = screen.getByRole("textbox", { name: "Agent filter" });
		fireEvent.change(filter, { target: { value: "codex" } });

		act(() => pushDesktopSecondarySidebar({ view: "bookmarked-chats" }));
		expect(
			screen.getByRole("heading", { name: "Bookmarked Chats" }),
		).toBeVisible();
		expect(filter).not.toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.getByRole("textbox", { name: "Agent filter" })).toHaveValue(
			"codex",
		);
	});

	it("uses a contextual icon in the header when Back is unavailable", () => {
		const view = render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() => openDesktopSecondarySidebar([{ view: "agents" }]));
		expect(
			view.container.querySelector(
				".desktop-secondary-sidebar-route-icon.icon-ai-chat",
			),
		).not.toBeNull();
		expect(screen.queryByRole("button", { name: "Back" })).toBeNull();

		act(() =>
			openDesktopSecondarySidebar([
				{
					view: "git-history",
					projectPath: "/repo",
					projectName: "Repo",
				},
			]),
		);
		expect(
			view.container.querySelector(
				".desktop-secondary-sidebar-route-icon.icon-git-branch",
			),
		).not.toBeNull();
	});

	it("renders project files as a tree and exposes the project actions", () => {
		const view = render(
			<DesktopSecondarySidebar
				width={320}
				overlay
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() =>
			openDesktopSecondarySidebar([
				{
					view: "project-files",
					projectPath: "/repo",
					projectName: "Repo",
					searchRequest: 2,
				},
			]),
		);

		expect(screen.getByRole("heading", { name: "Repo · Files" })).toBeVisible();
		expect(
			view.container.querySelector(
				".desktop-secondary-sidebar-route-icon.icon-folder",
			),
		).not.toBeNull();
		expect(projectTreeProps).toHaveBeenLastCalledWith(
			expect.objectContaining({
				project: expect.objectContaining({ name: "Repo", path: "/repo" }),
				refreshToken: 0,
				searchToken: 2,
				gitStatus: repoGitStatus,
			}),
		);

		fireEvent.click(screen.getByRole("button", { name: "Search Repo files" }));
		expect(projectTreeProps).toHaveBeenLastCalledWith(
			expect.objectContaining({ searchToken: expect.any(Number) }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Refresh Repo files" }));
		expect(refreshProjectExplorer).toHaveBeenCalledWith("/repo");
		expect(refreshGit).toHaveBeenCalledWith("/repo");
		fireEvent.click(
			screen.getByRole("button", { name: "Open Repo Git history" }),
		);
		expect(
			screen.getByRole("heading", { name: "Repo · History" }),
		).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Back" }));

		fireEvent.click(screen.getByRole("button", { name: "Open project file" }));
		expect(screen.queryByLabelText("Secondary sidebar")).toBeNull();
	});

	it("switches Git decorations with the project-files route", () => {
		render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() =>
			openDesktopSecondarySidebar([
				{
					view: "project-files",
					projectPath: "/repo",
					projectName: "Repo",
				},
			]),
		);
		expect(projectTreeProps).toHaveBeenLastCalledWith(
			expect.objectContaining({
				project: expect.objectContaining({ path: "/repo" }),
				gitStatus: repoGitStatus,
			}),
		);

		act(() =>
			openDesktopSecondarySidebar([
				{
					view: "project-files",
					projectPath: "/other",
					projectName: "Other",
				},
			]),
		);
		expect(projectTreeProps).toHaveBeenLastCalledWith(
			expect.objectContaining({
				project: expect.objectContaining({ path: "/other" }),
				gitStatus: otherGitStatus,
			}),
		);
	});

	it("keeps an inline project tree open after opening a file", () => {
		render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() =>
			openDesktopSecondarySidebar([
				{
					view: "project-files",
					projectPath: "/repo",
					projectName: "Repo",
				},
			]),
		);

		fireEvent.click(screen.getByRole("button", { name: "Open project file" }));
		expect(screen.getByLabelText("Secondary sidebar")).toBeVisible();
	});

	it("uses a left-edge separator inline and a dismissible backdrop in overlay mode", () => {
		const view = render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() => openDesktopSecondarySidebar([{ view: "agents" }]));
		expect(
			screen.getByRole("separator", { name: "Resize secondary sidebar" }),
		).toHaveAttribute("data-resize-edge", "left");

		view.rerender(
			<DesktopSecondarySidebar
				width={320}
				overlay
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		expect(
			screen.queryByRole("separator", { name: "Resize secondary sidebar" }),
		).toBeNull();
		fireEvent.click(
			screen.getAllByRole("button", { name: "Close secondary sidebar" })[0],
		);
		expect(screen.queryByLabelText("Secondary sidebar")).toBeNull();
	});

	it("closes without discarding the current stack", () => {
		render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
				gitStates={gitStates}
				onRefreshGit={refreshGit}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() => openDesktopSecondarySidebar([{ view: "agents" }]));
		act(closeDesktopSecondarySidebar);
		expect(screen.queryByLabelText("Secondary sidebar")).toBeNull();
		act(() => openDesktopSecondarySidebar([{ view: "agents" }]));
		expect(screen.getByLabelText("Secondary sidebar")).toBeVisible();
	});
});

function repositoryState(status: GitWorkingTreeStatus) {
	return {
		status,
		loading: false,
		error: null,
		busy: null,
		processingPaths: new Set<string>(),
		selectionTarget: null,
		selectedPaths: new Set<string>(),
		selectionAnchor: null,
		revision: 1,
	};
}
