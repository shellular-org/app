import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createProjectChild: vi.fn(),
	createTerminal: vi.fn(async () => null),
	removeProject: vi.fn(),
	showProjectFilesSidebar: vi.fn(),
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
		project,
		refreshToken,
		searchToken,
	}: {
		project: { name: string };
		refreshToken: number;
		searchToken: number;
	}) => (
		<div data-testid="project-tree" data-project={project.name}>
			Tree {refreshToken} Search {searchToken}
		</div>
	),
	createProjectChild: mocks.createProjectChild,
}));
vi.mock("./ProjectSessionsPanel", () => ({
	default: ({
		project,
		refreshToken,
	}: {
		project: { name: string };
		refreshToken: number;
	}) => (
		<div data-testid="project-sessions" data-project={project.name}>
			Sessions {refreshToken}
		</div>
	),
}));
vi.mock("./newChat", () => ({ requestNewChat: vi.fn() }));
vi.mock("./secondarySidebar", () => ({
	showProjectFilesSidebar: mocks.showProjectFilesSidebar,
}));

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
	mocks.projects.splice(1);
});
afterEach(cleanup);

describe("desktop project pane", () => {
	it("omits the redundant Open Folder sidebar button", () => {
		render(<DesktopProjectSidebar />);
		expect(screen.queryByRole("button", { name: "Open Folder" })).toBeNull();
	});

	it("loads only the first project for a new unsaved layout", () => {
		mocks.projects.push({
			name: "Beta",
			path: "/work/beta",
			gitInfo: { hasGit: false },
		});
		render(<DesktopProjectSidebar />);
		expect(screen.getAllByTestId("project-sessions")).toHaveLength(1);
		expect(screen.getByTestId("project-sessions")).toHaveAttribute(
			"data-project",
			"Alpha",
		);

		fireEvent.click(screen.getByRole("button", { name: "Beta" }));
		expect(screen.getAllByTestId("project-sessions")).toHaveLength(2);
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

	it("shows sessions with a single project-files action", () => {
		render(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, weight: 1 }}
				onExpanded={vi.fn()}
			/>,
		);

		const menu = screen.getByRole("button", { name: "Menu for Alpha" });
		expect(menu.closest("section")).not.toHaveClass("border-b");
		expect(menu.closest("section")).toHaveClass("bg-transparent");
		expect(menu).toHaveClass("size-6");
		expect(menu.querySelector(".icon-more-horizontal")).toHaveClass(
			"text-[14px]",
		);
		expect(screen.queryByRole("radiogroup")).toBeNull();
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

		const files = screen.getByRole("button", { name: "Open Alpha files" });
		expect(files.querySelector(".icon-folder")).not.toBeNull();
		fireEvent.click(files);
		expect(mocks.showProjectFilesSidebar).toHaveBeenCalledWith(
			"/work/alpha",
			"Alpha",
		);
	});

	it("retains mounted sessions while collapsing and expanding a project", () => {
		const view = render(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, weight: 1 }}
				onExpanded={vi.fn()}
			/>,
		);
		const sessions = screen.getByTestId("project-sessions");

		view.rerender(
			<DesktopProjectPane
				project={project}
				state={{ expanded: false, weight: 1 }}
				onExpanded={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("project-sessions")).toBe(sessions);
		expect(sessions.parentElement).toHaveClass("hidden");

		view.rerender(
			<DesktopProjectPane
				project={project}
				state={{ expanded: true, weight: 1 }}
				onExpanded={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("project-sessions")).toBe(sessions);
		expect(sessions.parentElement).not.toHaveClass("hidden");
	});
});
