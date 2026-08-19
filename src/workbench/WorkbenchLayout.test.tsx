import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import Page from "components/Page";
import ContextMenuHost from "context-menu/ContextMenuHost";
import {
	type ReactNode,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	commitCloseWorkbenchSurfaces,
	getWorkbenchSnapshot,
	moveWorkbenchSurface,
	openWorkbenchSurface,
	resetWorkbench,
	setWorkbenchSurfacePinned,
	splitWorkbenchSurface,
	subscribeWorkbench,
} from "./store";
import type { WorkbenchSurface } from "./types";
import WorkbenchLayout from "./WorkbenchLayout";

const mounts = new Map<string, number>();
const newActions = {
	terminal: vi.fn(),
	file: vi.fn(),
	chat: vi.fn(),
};

function StatefulSurface({ surface }: { surface: WorkbenchSurface }) {
	const [count, setCount] = useState(0);
	useEffect(() => {
		mounts.set(surface.id, (mounts.get(surface.id) ?? 0) + 1);
	}, [surface.id]);
	return (
		<button
			type="button"
			data-testid={`surface-${surface.id}`}
			onClick={() => setCount((value) => value + 1)}
		>
			{surface.title}: {count}
		</button>
	);
}

function ToolbarSurface({ surface }: { surface: WorkbenchSurface }) {
	return (
		<Page
			title={surface.title}
			toolbarSlot={<input aria-label={`${surface.title} search`} />}
			rightSlot={
				<button type="button" aria-label={`${surface.title} action`}>
					<span className="icon-search" aria-hidden="true" />
				</button>
			}
		>
			<div>{surface.title} body</div>
		</Page>
	);
}

function Harness({
	compact = false,
	renderSurface = (surface: WorkbenchSurface) => (
		<StatefulSurface surface={surface} />
	),
}: {
	compact?: boolean;
	renderSurface?: (surface: WorkbenchSurface) => ReactNode;
}) {
	const snapshot = useSyncExternalStore(
		subscribeWorkbench,
		getWorkbenchSnapshot,
	);
	return (
		<div style={{ width: 1200, height: 800 }}>
			<ContextMenuHost />
			<WorkbenchLayout
				snapshot={snapshot}
				compact={compact}
				surfaceTitle={(surface) => surface.title}
				renderSurface={renderSurface}
				renderWelcome={() => <div>Welcome</div>}
				onNewTerminal={newActions.terminal}
				onOpenFile={newActions.file}
				onNewChat={newActions.chat}
				onCloseSurface={async () => true}
				onCloseSurfaces={async () => true}
			/>
		</div>
	);
}

function open(id: string) {
	openWorkbenchSurface({
		kind: "utility",
		id,
		page: "settings",
		title: id.toUpperCase(),
		icon: "icon-settings",
	});
}

beforeEach(() => {
	resetWorkbench();
	mounts.clear();
	vi.clearAllMocks();
	localStorage.clear();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("workbench layout", () => {
	it("keeps the tab bar available for empty panes", () => {
		render(
			<Harness
				renderSurface={(surface) => (
					<Page
						title={surface.title}
						rightSlot={<button type="button">{surface.title} action</button>}
					>
						<div>{surface.title} body</div>
					</Page>
				)}
			/>,
		);
		const welcome = screen.getByText("Welcome");
		expect(welcome).toBeVisible();
		expect(welcome.parentElement).toHaveClass("flex-1");
		expect(screen.getByRole("tablist")).toBeVisible();
		expect(document.querySelector(".workbench-tab-strip")).not.toBeNull();
		expect(screen.getByRole("button", { name: "New" })).toBeVisible();

		act(() => open("a"));
		expect(screen.getByRole("tablist")).toBeVisible();
		expect(screen.getByRole("button", { name: "A action" })).toBeVisible();
		expect(
			screen
				.getByRole("button", { name: "A action" })
				.closest(".workbench-tab-strip"),
		).not.toBeNull();

		act(() => commitCloseWorkbenchSurfaces(["a"]));
		expect(screen.getByText("Welcome")).toBeVisible();
		expect(screen.getByRole("tablist")).toBeVisible();
		expect(document.querySelector(".workbench-tab-strip")).not.toBeNull();
	});

	it("runs all three actions from the tab-bar plus menu", () => {
		render(<Harness />);

		fireEvent.click(screen.getByRole("button", { name: "New" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "New Terminal" }));
		expect(newActions.terminal).toHaveBeenCalledOnce();

		fireEvent.click(screen.getByRole("button", { name: "New" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Open File…" }));
		expect(newActions.file).toHaveBeenCalledOnce();

		fireEvent.click(screen.getByRole("button", { name: "New" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "New Chat…" }));
		expect(newActions.chat).toHaveBeenCalledOnce();
	});

	it("targets the pane whose plus menu was opened", () => {
		open("a");
		open("b");
		splitWorkbenchSurface("b", "group:root", "right");
		let actionPane = "";
		newActions.terminal.mockImplementation(() => {
			actionPane = getWorkbenchSnapshot().focusedGroupId;
		});
		render(<Harness />);

		const firstPaneNew = screen.getAllByRole("button", { name: "New" })[0];
		fireEvent.pointerDown(firstPaneNew);
		fireEvent.click(firstPaneNew);
		fireEvent.click(screen.getByRole("menuitem", { name: "New Terminal" }));

		expect(actionPane).toBe("group:root");
	});

	it("keeps every stateful surface mounted once through split, move, collapse, and compact mode", () => {
		open("a");
		open("b");
		const view = render(<Harness />);
		expect(mounts.get("a")).toBe(1);
		expect(mounts.get("b")).toBe(1);

		const a = screen.getByTestId("surface-a");
		fireEvent.click(a);
		expect(a).toHaveTextContent("A: 1");

		act(() => {
			splitWorkbenchSurface("b", "group:root", "right");
		});
		expect(mounts.get("a")).toBe(1);
		expect(mounts.get("b")).toBe(1);
		expect(screen.getAllByRole("group", { name: /Pane with/ })).toHaveLength(2);

		const bGroup = getWorkbenchSnapshot().focusedGroupId;
		act(() => {
			moveWorkbenchSurface("b", "group:root");
		});
		expect(getWorkbenchSnapshot().root.type).toBe("group");
		expect(mounts.get("a")).toBe(1);
		expect(screen.getByTestId("surface-a")).toHaveTextContent("A: 1");
		expect(bGroup).not.toBe("group:root");

		view.rerender(<Harness compact />);
		expect(mounts.get("a")).toBe(1);
		expect(mounts.get("b")).toBe(1);
	});

	it("renders active page actions for every visible pane and exposes compact switching", () => {
		open("a");
		open("b");
		splitWorkbenchSurface("b", "group:root", "right");
		const view = render(
			<Harness
				renderSurface={(surface) => (
					<Page
						title={surface.title}
						rightSlot={<button type="button">{surface.title} action</button>}
					>
						<div>{surface.title} body</div>
					</Page>
				)}
			/>,
		);
		expect(screen.getByRole("button", { name: "A action" })).toBeVisible();
		expect(screen.getByRole("button", { name: "B action" })).toBeVisible();

		view.rerender(
			<Harness
				compact
				renderSurface={(surface) => (
					<Page
						title={surface.title}
						rightSlot={<button type="button">{surface.title} action</button>}
					>
						<div>{surface.title} body</div>
					</Page>
				)}
			/>,
		);
		expect(screen.getByRole("combobox", { name: "Switch pane" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "A action" })).toBeNull();
		expect(screen.getByRole("button", { name: "B action" })).toBeVisible();
	});

	it("keeps expanded controls in the surface without creating pane sidebars", () => {
		open("a");
		open("b");
		render(
			<Harness
				renderSurface={(surface) => <ToolbarSurface surface={surface} />}
			/>,
		);

		fireEvent.click(screen.getByRole("tab", { name: "A" }));
		const aSearch = screen.getByRole("textbox", { name: "A search" });
		expect(aSearch.closest(".page-toolbar")).not.toBeNull();
		expect(aSearch.closest(".workbench-tab-strip")).toBeNull();
		fireEvent.click(screen.getByRole("tab", { name: "B" }));
		const bSearch = screen.getByRole("textbox", { name: "B search" });
		expect(bSearch.closest(".page-toolbar")).not.toBeNull();
		expect(
			document.querySelector(".workbench-secondary-panel-target"),
		).toBeNull();
	});

	it("renders pinned tabs as a protected prefix", () => {
		open("a");
		open("b");
		setWorkbenchSurfacePinned("b", true);
		render(<Harness />);
		const tabs = screen.getAllByRole("tab");
		expect(tabs[0]).toHaveAccessibleName("B");
		expect(tabs[0].closest(".workbench-tab")).toHaveClass("is-pinned");
		expect(tabs[0]).toHaveAttribute("aria-description", "Pinned");
	});

	it("resizes splits with the keyboard and hides sashes in compact mode", () => {
		open("a");
		open("b");
		splitWorkbenchSurface("b", "group:root", "right");
		const view = render(<Harness />);
		const sash = screen.getByRole("separator", { name: "Resize columns" });
		expect(sash.tagName).toBe("DIV");
		expect(sash).toHaveClass("workbench-divider", "is-interactive");
		expect(sash).toHaveAttribute("data-orientation", "vertical");
		expect(sash).toHaveAttribute("data-extend-hit-area", "true");
		expect(sash).toHaveAttribute("aria-valuenow", "50");
		fireEvent.keyDown(sash, { key: "ArrowRight" });
		expect(
			screen.getByRole("separator", { name: "Resize columns" }),
		).toHaveAttribute("aria-valuenow", "52");
		fireEvent.doubleClick(sash);
		expect(
			screen.getByRole("separator", { name: "Resize columns" }),
		).toHaveAttribute("aria-valuenow", "50");

		view.rerender(<Harness compact />);
		expect(
			screen.queryByRole("separator", { name: "Resize columns" }),
		).toBeNull();
	});

	it("uses the same soft divider primitive for stacked rows", () => {
		open("a");
		open("b");
		splitWorkbenchSurface("b", "group:root", "down");
		render(<Harness />);

		const sash = screen.getByRole("separator", { name: "Resize rows" });
		expect(sash.tagName).toBe("DIV");
		expect(sash).toHaveClass("workbench-divider", "is-interactive");
		expect(sash).toHaveAttribute("data-orientation", "horizontal");
	});
});
