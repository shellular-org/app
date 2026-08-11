import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state", () => ({
	useShellular: () => ({ agents: {} }),
}));
vi.mock("tabs/agents", () => ({
	default: () => (
		<label>
			Agent filter
			<input aria-label="Agent filter" />
		</label>
	),
}));
vi.mock("pages/bookmark-sessions", () => ({ default: () => <div>Bookmarks</div> }));
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
});

afterEach(cleanup);

describe("DesktopSecondarySidebar", () => {
	it("keeps previous pages mounted and restores their state on Back", () => {
		render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
				onResize={() => {}}
				onResizeEnd={() => {}}
			/>,
		);
		act(() => openDesktopSecondarySidebar([{ view: "agents" }]));
		const filter = screen.getByRole("textbox", { name: "Agent filter" });
		fireEvent.change(filter, { target: { value: "codex" } });

		act(() =>
			pushDesktopSecondarySidebar({ view: "bookmarked-chats" }),
		);
		expect(screen.getByRole("heading", { name: "Bookmarked Chats" })).toBeVisible();
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

	it("uses a left-edge separator inline and a dismissible backdrop in overlay mode", () => {
		const view = render(
			<DesktopSecondarySidebar
				width={320}
				overlay={false}
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
