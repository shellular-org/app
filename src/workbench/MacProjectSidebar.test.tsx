import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createProjectChild: vi.fn(),
	createTerminal: vi.fn(async () => null),
	removeProject: vi.fn(),
	projects: [
		{
			name: "Alpha",
			path: "/work/alpha",
			gitInfo: { hasGit: false },
		},
	],
}));

vi.mock("bridge/dialog", () => ({
	default: { confirm: vi.fn(async () => false) },
}));
vi.mock("components/AppMenu", () => ({
	default: ({
		items,
		children,
		ariaLabel,
		buttonClassName,
	}: {
		items: Array<{ label: string; onClick: () => void }>;
		children: React.ReactNode;
		ariaLabel: string;
		buttonClassName: string;
	}) => (
		<>
			<button type="button" aria-label={ariaLabel} className={buttonClassName}>
				{children}
			</button>
			{items.map((item) => (
				<button type="button" key={item.label} onClick={item.onClick}>
					{item.label}
				</button>
			))}
		</>
	),
}));
vi.mock("context-menu/ContextMenuButton", () => ({
	default: ({
		children,
		ariaLabel,
		className,
		target,
	}: {
		children: React.ReactNode;
		ariaLabel: string;
		className: string;
		target: {
			handlers: Record<
				string,
				{
					run: () => void;
					label?: string | (() => string);
					visible?: boolean | (() => boolean);
				}
			>;
		};
	}) => (
		<>
			<button type="button" aria-label={ariaLabel} className={className}>
				{children}
			</button>
			{Object.entries(target.handlers).map(([command, handler]) => {
				const visible =
					typeof handler.visible === "function"
						? handler.visible()
						: (handler.visible ?? true);
				if (!visible) return null;
				const label =
					typeof handler.label === "function"
						? handler.label()
						: (handler.label ?? command);
				return (
					<button type="button" key={command} onClick={handler.run}>
						{label}
					</button>
				);
			})}
		</>
	),
}));
vi.mock("state", () => ({
	useShellular: () => ({
		connectionStatus: "connected",
		projects: mocks.projects,
		loadingProjects: false,
		createTerminal: mocks.createTerminal,
		removeProject: mocks.removeProject,
	}),
}));
vi.mock("./integration", () => ({
	workspaceIntegration: {
		capabilities: vi.fn(async () => ({ canReveal: false })),
	},
}));
vi.mock("./ProjectExplorerTree", () => ({
	default: ({
		refreshToken,
		searchToken,
	}: {
		refreshToken: number;
		searchToken: number;
	}) => (
		<div data-testid="project-tree">
			Tree {refreshToken} Search {searchToken}
		</div>
	),
	createProjectChild: mocks.createProjectChild,
}));
vi.mock("./ProjectSessionsPanel", () => ({
	default: ({ refreshToken }: { refreshToken: number }) => (
		<div data-testid="project-sessions">Sessions {refreshToken}</div>
	),
}));
vi.mock("./newChat", () => ({ requestNewChat: vi.fn() }));

import {
	DesktopProjectPane,
	default as DesktopProjectSidebar,
	readDesktopProjectLayout,
} from "./MacProjectSidebar";

const project = {
	name: "Alpha",
	path: "/work/alpha",
	gitInfo: { hasGit: false },
} as never;

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
});
afterEach(cleanup);

describe("desktop project pane", () => {
	it("omits the redundant Open Folder sidebar button", () => {
		render(<DesktopProjectSidebar />);
		expect(screen.queryByRole("button", { name: "Open Folder" })).toBeNull();
	});

	it("reads the previous macOS layout as a migration fallback", () => {
		localStorage.setItem(
			"shellular:mac-project-layout:v1:host-1",
			JSON.stringify({
				"/work/alpha": { expanded: false, mode: "sessions", weight: 0.4 },
			}),
		);
		expect(readDesktopProjectLayout("host-1")).toMatchObject({
			"/work/alpha": { expanded: false, mode: "sessions", weight: 0.4 },
		});
	});

	it("uses a compact accessible menu and refreshes only the Tree view", () => {
		render(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, mode: "tree", weight: 1 }}
				onExpanded={vi.fn()}
				onMode={vi.fn()}
			/>,
		);

		const menu = screen.getByRole("button", { name: "Menu for Alpha" });
		expect(menu.closest("section")).not.toHaveClass("border-b");
		expect(menu.closest("section")).toHaveClass("bg-transparent");
		expect(menu).toHaveClass("size-6");
		expect(menu.querySelector(".icon-more-horizontal")).toHaveClass(
			"text-[14px]",
		);
		expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
		expect(screen.getByTestId("project-tree")).toHaveTextContent("Tree 0");
		const viewToggle = screen.getByRole("radiogroup", {
			name: "Alpha view",
		});
		expect(viewToggle).toContainElement(
			screen.getByRole("radio", { name: "Project tree" }),
		);
		expect(
			screen.getByRole("radio", { name: "Project tree" }).nextElementSibling,
		).toHaveClass("icon-account_tree");
		expect(
			screen.getByRole("radio", { name: "Sessions" }).nextElementSibling,
		).toHaveClass("icon-ai-chat");
		expect(
			screen
				.getByText("Alpha")
				.closest("button")
				?.querySelector(".icon-folder"),
		).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Search Files…" }));
		expect(screen.getByTestId("project-tree")).toHaveTextContent("Search 1");

		fireEvent.click(screen.getByRole("button", { name: "Refresh Explorer" }));
		expect(screen.getByTestId("project-tree")).toHaveTextContent("Tree 1");
		expect(
			screen.queryByRole("button", { name: "Refresh Sessions" }),
		).toBeNull();
	});

	it("switches menu actions and refresh state for Sessions mode", () => {
		render(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, mode: "sessions", weight: 1 }}
				onExpanded={vi.fn()}
				onMode={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "New Chat…" })).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Refresh Explorer" }),
		).toBeNull();
		expect(screen.getByTestId("project-sessions")).toHaveTextContent(
			"Sessions 0",
		);

		fireEvent.click(screen.getByRole("button", { name: "Refresh Sessions" }));
		expect(screen.getByTestId("project-sessions")).toHaveTextContent(
			"Sessions 1",
		);
	});

	it("retains a mounted tree while switching views", () => {
		const onMode = vi.fn();
		const view = render(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, mode: "tree", weight: 1 }}
				onExpanded={vi.fn()}
				onMode={onMode}
			/>,
		);
		const tree = screen.getByTestId("project-tree");

		view.rerender(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, mode: "sessions", weight: 1 }}
				onExpanded={vi.fn()}
				onMode={onMode}
			/>,
		);
		expect(screen.getByTestId("project-sessions")).toBeVisible();
		expect(tree.parentElement).toHaveClass("hidden");

		view.rerender(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, mode: "tree", weight: 1 }}
				onExpanded={vi.fn()}
				onMode={onMode}
			/>,
		);
		expect(screen.getByTestId("project-tree")).toBe(tree);
		expect(tree.parentElement).toHaveClass("h-full", "min-h-0");
		expect(tree.parentElement).not.toHaveClass("hidden");
	});
});
