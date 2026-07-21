import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shellularState = vi.hoisted(() => ({
	activeTerminals: [],
	connectionStatus: "disconnected",
	createTerminal: vi.fn(async () => null),
	closeTerminal: vi.fn(),
	terminalsRestoring: false,
	terminalNames: {},
	terminalProcesses: {},
	agents: {},
	projects: [],
	runGitOperation: vi.fn(),
}));
const localCliSnapshot = vi.hoisted(() => ({
	capability: { available: true, sandboxed: false, protocolVersion: 1 },
	cli: null,
	busy: false,
	error: null,
	phase: "idle" as const,
}));
const scrollIntoView = vi.fn();
const nativeMocks = vi.hoisted(() => ({
	commandHandler: null as ((command: string) => void) | null,
	setWindowTitle: vi.fn(async () => undefined),
	disposeCommandHandler: vi.fn(),
}));

vi.mock("bridge/dialog", () => ({
	default: { confirm: vi.fn(async () => true) },
}));
vi.mock("bridge/browser", () => ({
	default: {
		syncConnectionContext: vi.fn(async () => undefined),
		syncTheme: vi.fn(async () => undefined),
		open: vi.fn(async () => undefined),
	},
}));
vi.mock("bridge/native", () => ({
	default: {
		setDesktopCommandHandler: vi.fn((handler) => {
			nativeMocks.commandHandler = handler;
			return () => {
				nativeMocks.disposeCommandHandler();
				if (nativeMocks.commandHandler === handler) {
					nativeMocks.commandHandler = null;
				}
			};
		}),
		pickLocalFiles: vi.fn(async () => []),
		openInBrowser: vi.fn(async () => undefined),
		setWindowTitle: nativeMocks.setWindowTitle,
	},
}));
vi.mock("./DesktopProfileMenu", () => ({
	default: ({ onOpen }: { onOpen: (page: "settings") => void }) => (
		<button
			type="button"
			onClick={() => onOpen("settings")}
			aria-label="User menu"
		>
			AK
		</button>
	),
}));
vi.mock("components/LocalCliDashboard", () => ({
	default: () => <div>Remote Access sidebar</div>,
}));
vi.mock("state", () => ({
	useShellular: () => shellularState,
}));
vi.mock("state/connection", () => ({
	getHostInfo: () => null,
	getConnectionSnapshot: () => ({
		connectionStatus: "disconnected",
		hostInfo: null,
		transport: null,
	}),
	subscribeState: () => () => {},
}));
vi.mock("state/localCli", () => ({
	getLocalCliSnapshot: () => localCliSnapshot,
	subscribeLocalCli: () => () => {},
}));
vi.mock("state/chatTabs", () => ({
	getChatTabs: () => [],
	subscribeChatTabs: () => () => {},
}));
vi.mock("tabs/home", () => ({ default: () => <div>Home sidebar</div> }));
vi.mock("tabs/agents", () => ({
	default: ({ compact }: { compact?: boolean }) => (
		<div data-compact={compact || undefined}>Agents sidebar</div>
	),
}));
vi.mock("./ProjectSidebar", () => ({
	default: () => <div>Projects sidebar</div>,
}));
vi.mock("./ShellularFileIcon", () => ({
	ShellularFileIcon: ({ path }: { path: string }) => (
		<svg data-testid="trees-file-icon" data-path={path} />
	),
	ShellularFileIconSprite: () => null,
	TREE_ICON_THEME_STYLE: {},
}));
vi.mock("./SurfaceRenderer", async () => {
	const Page = (await import("components/Page")).default;
	return {
		default: ({ surface }: { surface: { title: string } }) => (
			<Page
				title={surface.title}
				rightSlot={
					<button type="button" aria-label={`${surface.title} action`}>
						Action
					</button>
				}
			>
				<div>Surface: {surface.title}</div>
			</Page>
		),
	};
});

import native from "bridge/native";
import DesktopShell from "./DesktopShell";
import {
	openWorkbenchSurface,
	registerWorkbenchCommandHandlers,
	resetWorkbench,
} from "./store";

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	nativeMocks.commandHandler = null;
	shellularState.connectionStatus = "disconnected";
	shellularState.projects = [];
	resetWorkbench();
	Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: scrollIntoView,
	});
	window.matchMedia = vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe("desktop shell", () => {
	it("renders the streamlined activity rail and welcome workspace", () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		const names = within(navigation)
			.getAllByRole("button")
			.map((button) => button.getAttribute("aria-label"));
		expect(names).toEqual([
			"Home",
			"Remote Access",
			"Projects",
			"Source Control",
			"User menu",
		]);
		expect(
			within(navigation).queryByRole("button", { name: "Terminal" }),
		).toBeNull();
		expect(
			within(navigation).queryByRole("button", { name: "More" }),
		).toBeNull();
		expect(screen.getByText("Home sidebar")).toBeVisible();
		expect(screen.getByRole("heading", { name: "Shellular" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Close sidebar" })).toBeNull();

		fireEvent.click(within(navigation).getByRole("button", { name: "Home" }));
		expect(screen.queryByText("Home sidebar")).toBeNull();
		fireEvent.click(within(navigation).getByRole("button", { name: "Home" }));
		expect(screen.getByText("Home sidebar")).toBeVisible();
	});

	it("suppresses text selection while resizing the sidebar", () => {
		render(<DesktopShell />);
		const input = document.createElement("textarea");
		input.value = "selected text";
		document.body.append(input);
		input.focus();
		input.select();

		const separator = screen.getByRole("separator", {
			name: "Resize sidebar",
		});
		fireEvent.pointerDown(separator, {
			button: 0,
			pointerId: 1,
			clientX: 348,
		});
		expect(document.activeElement).not.toBe(input);
		expect(document.documentElement).toHaveClass("workbench-is-resizing");

		fireEvent.pointerMove(window, { clientX: 368, pointerId: 1 });
		expect(separator).toHaveAttribute("aria-valuenow", "320");
		expect(document.documentElement).toHaveClass("workbench-is-resizing");
		expect(localStorage.getItem("shellular:desktop-sidebar-width")).toBeNull();

		fireEvent.pointerMove(window, { clientX: 388, pointerId: 1 });
		expect(separator).toHaveAttribute("aria-valuenow", "340");
		expect(document.documentElement).toHaveClass("workbench-is-resizing");
		expect(localStorage.getItem("shellular:desktop-sidebar-width")).toBeNull();
		fireEvent.pointerUp(window, { pointerId: 1 });
		expect(document.documentElement).not.toHaveClass("workbench-is-resizing");
		expect(localStorage.getItem("shellular:desktop-sidebar-width")).toBe("340");
		input.remove();
	});

	it("uses a full-height pointer-safe sidebar sash", () => {
		render(<DesktopShell />);
		const separator = screen.getByRole("separator", {
			name: "Resize sidebar",
		});
		expect(separator.tagName).toBe("DIV");
		expect(separator).toHaveClass("workbench-sidebar-resizer");
		expect(separator).toHaveAttribute("aria-valuemin", "240");
		expect(separator).toHaveAttribute("aria-valuemax", "480");

		fireEvent.keyDown(separator, { key: "ArrowRight" });
		expect(separator).toHaveAttribute("aria-valuenow", "310");
		expect(localStorage.getItem("shellular:desktop-sidebar-width")).toBe("310");
	});

	it("shows Remote Access as the second activity", () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		fireEvent.click(
			within(navigation).getByRole("button", { name: "Remote Access" }),
		);
		expect(screen.getByText("Remote Access sidebar")).toBeVisible();
	});

	it("shows the distinct changed-file count on Source Control", async () => {
		shellularState.connectionStatus = "connected";
		shellularState.projects = [
			{
				name: "Alpha",
				path: "/work/alpha",
				gitInfo: { hasGit: true },
			},
		] as never[];
		shellularState.runGitOperation.mockResolvedValue({
			status: {
				hasGit: true,
				ahead: 0,
				behind: 0,
				staged: 1,
				unstaged: 1,
				untracked: 0,
				files: [
					{
						path: "partial.ts",
						status: "modified",
						indexStatus: "M",
						worktreeStatus: "M",
						staged: true,
						unstaged: true,
						untracked: false,
					},
				],
			},
		});

		render(<DesktopShell />);
		const sourceControl = screen.getByRole("button", {
			name: "Source Control",
		});
		await waitFor(() =>
			expect(sourceControl).toHaveAttribute(
				"aria-description",
				"1 changed file",
			),
		);
		const badge = within(sourceControl).getByText("1");
		expect(badge).toHaveClass("bg-button-background", "text-button-text");
		expect(badge).not.toHaveClass("text-white");
	});

	it("opens avatar destinations as stable main-area tabs", () => {
		render(<DesktopShell showDesktopTitlebar />);
		const titlebar = screen.getByRole("banner");
		expect(within(titlebar).getByText("Shellular")).toBeVisible();
		expect(within(titlebar).getByText("Home")).toBeVisible();

		fireEvent.click(screen.getByRole("button", { name: "User menu" }));
		expect(within(titlebar).getByText("Settings")).toBeVisible();
		expect(screen.getByRole("tab", { name: "Settings" })).toBeVisible();
		expect(screen.getByText("Surface: Settings")).toBeVisible();
		expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
	});

	it("uses a project-first context title without the Workbench label", () => {
		shellularState.projects = [
			{ name: "Alpha", path: "/work/alpha", gitInfo: { hasGit: true } },
		] as never[];
		render(<DesktopShell showDesktopTitlebar />);
		fireEvent.click(screen.getByRole("button", { name: "Projects" }));
		const titlebar = screen.getByRole("banner");
		expect(within(titlebar).getByText("Alpha")).toBeVisible();
		expect(within(titlebar).queryByText("Workbench")).toBeNull();
		expect(document.title).toBe("Alpha — Shellular");
	});

	it("keeps macOS traffic-light space without duplicating app menus or branding", () => {
		vi.stubEnv("IS_MACOS", "true");
		render(<DesktopShell showDesktopTitlebar />);
		const titlebar = screen.getByRole("banner");
		expect(within(titlebar).getByText("Home")).toBeVisible();
		expect(within(titlebar).queryByText("Shellular")).toBeNull();
		expect(within(titlebar).queryByRole("menubar")).toBeNull();
		expect(nativeMocks.setWindowTitle).toHaveBeenLastCalledWith("Home");
	});

	it("opens View utilities from the browser menu without changing the sidebar", async () => {
		vi.stubEnv("IS_BROWSER", "true");
		render(<DesktopShell showDesktopTitlebar />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		expect(
			within(navigation).queryByRole("button", { name: "Ports" }),
		).toBeNull();
		fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Ports" }));
		expect(screen.getByRole("tab", { name: "Ports" })).toBeVisible();
		expect(
			within(navigation).getByRole("button", { name: "Home" }),
		).toHaveClass("active");
	});

	it("opens the shared New Chat dialog from File", async () => {
		vi.stubEnv("IS_BROWSER", "true");
		render(<DesktopShell showDesktopTitlebar />);
		fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "New Chat" }));
		expect(screen.getByRole("dialog", { name: "New Chat" })).toBeVisible();
	});

	it("uses registered surface command state for File actions", async () => {
		vi.stubEnv("IS_BROWSER", "true");
		const save = vi.fn();
		render(<DesktopShell showDesktopTitlebar />);
		act(() => {
			openWorkbenchSurface({
				kind: "utility",
				id: "editable",
				page: "settings",
				title: "Editable",
				icon: "icon-file",
			});
			registerWorkbenchCommandHandlers("editable", {
				save: { run: save },
			});
		});
		fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
		const saveItem = await screen.findByRole("menuitem", { name: "Save" });
		expect(saveItem).toBeEnabled();
		fireEvent.click(saveItem);
		await waitFor(() => expect(save).toHaveBeenCalledOnce());
	});

	it("does not change the active sidebar when an avatar destination opens", async () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		fireEvent.click(
			within(navigation).getByRole("button", { name: "User menu" }),
		);
		expect(screen.getByRole("tab", { name: "Settings" })).toBeVisible();
		expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
		expect(screen.getByText("Surface: Settings")).toBeVisible();
		expect(
			within(navigation).getByRole("button", { name: "Home" }),
		).toHaveClass("active");
	});

	it("renders active page actions in the workbench tabbar", () => {
		render(<DesktopShell />);
		fireEvent.click(screen.getByRole("button", { name: "User menu" }));
		const action = screen.getByRole("button", { name: "Settings action" });
		expect(action).toBeVisible();
		expect(action.closest(".workbench-tab-strip")).not.toBeNull();
	});

	it("uses the Trees file icon for editor tabs", () => {
		render(<DesktopShell />);
		act(() =>
			openWorkbenchSurface({
				kind: "editor",
				id: "editor:/work/alpha/src/app.ts",
				title: "app.ts",
				icon: "icon-typescript",
				filePath: "/work/alpha/src/app.ts",
			}),
		);
		expect(screen.getByTestId("trees-file-icon")).toHaveAttribute(
			"data-path",
			"/work/alpha/src/app.ts",
		);
	});

	it("shows a close control only for the active tab", () => {
		render(<DesktopShell />);
		act(() => {
			openWorkbenchSurface({
				kind: "utility",
				id: "first",
				page: "settings",
				title: "First",
				icon: "icon-settings",
			});
			openWorkbenchSurface({
				kind: "utility",
				id: "second",
				page: "about",
				title: "Second",
				icon: "icon-info",
			});
		});

		expect(screen.getByRole("button", { name: "Close Second" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Close First" })).toBeNull();
		expect(screen.queryByRole("button", { name: "New terminal" })).toBeNull();

		fireEvent.click(screen.getByRole("tab", { name: "First" }));
		expect(screen.getByRole("button", { name: "Close First" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Close Second" })).toBeNull();
	});

	it("routes native View utilities to main-area tabs", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_MACOS", "true");
		render(<DesktopShell />);
		expect(nativeMocks.commandHandler).not.toBeNull();

		act(() => nativeMocks.commandHandler?.("ports"));
		expect(screen.getByRole("tab", { name: "Ports" })).toBeVisible();
		expect(document.title).toBe("Ports");
		act(() => nativeMocks.commandHandler?.("system-monitor"));
		expect(screen.getByRole("tab", { name: "System Monitor" })).toBeVisible();
		expect(nativeMocks.setWindowTitle).toHaveBeenLastCalledWith(
			"System Monitor",
		);
		expect(screen.getByRole("button", { name: "Home" })).toHaveClass("active");
	});

	it("registers one current native desktop command handler", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		const view = render(<DesktopShell />);
		const firstHandler = nativeMocks.commandHandler;
		expect(firstHandler).not.toBeNull();

		act(() => firstHandler?.("toggle-sidebar"));
		expect(screen.getByRole("button", { name: "Home" })).not.toHaveClass(
			"active",
		);
		expect(nativeMocks.commandHandler).toBe(firstHandler);
		expect(vi.mocked(native.setDesktopCommandHandler)).toHaveBeenCalledOnce();

		view.unmount();
		expect(nativeMocks.disposeCommandHandler).toHaveBeenCalledOnce();
		expect(nativeMocks.commandHandler).toBeNull();
	});
});
