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
	createTerminal: vi.fn<() => Promise<string | null>>(async () => null),
	closeTerminal: vi.fn(),
	terminalsRestoring: false,
	terminalNames: {},
	terminalProcesses: {},
	getXterm: vi.fn(() => null),
	agents: {},
	projects: [],
	runGitOperation: vi.fn(),
	profileDestination: "settings" as "settings" | "agents",
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
	setDesktopShortcutContext: vi.fn(async () => undefined),
	disposeCommandHandler: vi.fn(),
}));
const shortcutMocks = vi.hoisted(() => ({
	createProjectChild: vi.fn(),
	refreshProjectExplorer: vi.fn(async () => undefined),
	requestProjectSearch: vi.fn(),
	openProjectPicker: vi.fn(),
}));
const themeMocks = vi.hoisted(() => ({
	handler: null as (() => void) | null,
	unsubscribe: vi.fn(),
}));

vi.mock("bridge/dialog", () => ({
	default: {
		confirm: vi.fn(async () => true),
		message: vi.fn(async () => undefined),
		textInput: vi.fn(async () => null),
		select: vi.fn(async () => null),
		selectProjectFile: vi.fn(async () => null),
	},
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
		setDesktopShortcutContext: nativeMocks.setDesktopShortcutContext,
	},
}));
vi.mock("themes", async (importOriginal) => {
	const actual = await importOriginal<typeof import("themes")>();
	return {
		...actual,
		default: new Proxy(actual.default, {
			get(target, property) {
				if (property === "subscribe") {
					return (handler: () => void) => {
						themeMocks.handler = handler;
						return () => {
							themeMocks.unsubscribe();
							if (themeMocks.handler === handler) themeMocks.handler = null;
							};
						};
					}
					return Reflect.get(target, property, target);
			},
		}),
	};
});
vi.mock("tabs/projects/useProjectPicker", () => ({
	default: () => ({ openProjectPicker: shortcutMocks.openProjectPicker }),
}));
vi.mock("./ProjectExplorerTree", () => ({
	createProjectChild: shortcutMocks.createProjectChild,
}));
vi.mock("./projectTreeWorkspace", () => ({
	refreshProjectExplorer: shortcutMocks.refreshProjectExplorer,
}));
vi.mock("./projectCommands", async (importOriginal) => ({
	...(await importOriginal<typeof import("./projectCommands")>()),
	requestProjectSearch: shortcutMocks.requestProjectSearch,
}));
vi.mock("./DesktopProfileMenu", () => ({
	default: ({ onOpen }: { onOpen: (page: "settings" | "agents") => void }) => (
		<button
			type="button"
			onClick={() => onOpen(shellularState.profileDestination)}
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
	default: () => (
		<div>
			Projects sidebar
			<input aria-label="Project filter" />
		</div>
	),
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

import dialog from "bridge/dialog";
import browser from "bridge/browser";
import native from "bridge/native";
import DesktopShell from "./DesktopShell";
import {
	getWorkbenchSnapshot,
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
	themeMocks.handler = null;
	shellularState.connectionStatus = "disconnected";
	shellularState.activeTerminals = [];
	shellularState.projects = [];
	shellularState.profileDestination = "settings";
	shellularState.createTerminal.mockResolvedValue(null);
	shellularState.getXterm.mockReturnValue(null);
	shortcutMocks.createProjectChild.mockResolvedValue(null);
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
	it("uses media-query thresholds instead of rerendering for every resize pixel", () => {
		render(<DesktopShell />);
		const subscriptions = vi.mocked(window.matchMedia).mock.calls.length;

		for (let index = 0; index < 50; index += 1) {
			window.dispatchEvent(new Event("resize"));
		}

		expect(window.matchMedia).toHaveBeenCalledTimes(subscriptions);
		expect(
			vi
				.mocked(window.matchMedia)
				.mock.calls.some(([query]) => query.includes("max-width: 899px")),
		).toBe(true);
		expect(
			vi
				.mocked(window.matchMedia)
				.mock.calls.some(([query]) => query.includes("max-width: 1163.98px")),
		).toBe(true);
	});

	it("synchronizes browser-owned pages when the macOS theme changes", async () => {
		vi.stubEnv("IS_MACOS", "true");
		render(<DesktopShell />);

		await waitFor(() => expect(themeMocks.handler).not.toBeNull());
		vi.mocked(browser.syncTheme).mockClear();
		act(() => themeMocks.handler?.());

		expect(browser.syncTheme).toHaveBeenCalledTimes(1);
	});

	it("opens Agents in the global secondary sidebar without creating a tab", () => {
		shellularState.profileDestination = "agents";
		render(<DesktopShell />);
		fireEvent.click(screen.getByRole("button", { name: "User menu" }));
		expect(screen.getByLabelText("Secondary sidebar")).toBeVisible();
		expect(screen.getByRole("heading", { name: "Agents" })).toBeVisible();
		expect(screen.queryByRole("tab", { name: "Agents" })).toBeNull();
	});

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

	it("keeps the Projects activity mounted while switching sidebars", () => {
		render(<DesktopShell />);
		fireEvent.click(screen.getByRole("button", { name: "Projects" }));
		const filter = screen.getByRole("textbox", { name: "Project filter" });
		fireEvent.change(filter, { target: { value: "src" } });
		fireEvent.click(screen.getByRole("button", { name: "Home" }));
		expect(filter).not.toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Projects" }));
		expect(screen.getByRole("textbox", { name: "Project filter" })).toHaveValue(
			"src",
		);
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

	it("uses contextual Ctrl+N for chat or a project-backed new file", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		shellularState.projects = [
			{ name: "Alpha", path: "/work/alpha", addedAt: 1 },
		] as never[];
		shortcutMocks.createProjectChild.mockResolvedValue({
			type: "add",
			path: "/work/alpha/new.ts",
			entryType: "file",
		});
		render(<DesktopShell />);

		act(() =>
			openWorkbenchSurface({
				kind: "editor",
				id: "editor:/work/alpha/current.ts",
				title: "current.ts",
				icon: "icon-typescript",
				filePath: "/work/alpha/current.ts",
			}),
		);
		fireEvent.keyDown(window, { key: "n", code: "KeyN", ctrlKey: true });
		await waitFor(() =>
			expect(shortcutMocks.createProjectChild).toHaveBeenCalledWith(
				"/work/alpha",
				"file",
			),
		);
		expect(shortcutMocks.refreshProjectExplorer).toHaveBeenCalledWith(
			"/work/alpha",
		);
		expect(screen.getByRole("tab", { name: "new.ts" })).toBeVisible();

		act(() =>
			openWorkbenchSurface({
				kind: "chat",
				id: "chat:alpha",
				title: "Alpha Chat",
				icon: "icon-ai-chat",
				agentId: "codex",
				sessionId: "session",
				workspacePath: "/work/alpha",
			}),
		);
		fireEvent.keyDown(window, { key: "n", code: "KeyN", ctrlKey: true });
		expect(
			await screen.findByRole("dialog", { name: "New Chat" }),
		).toBeVisible();
	});

	it("asks for a project when contextual New has no project context", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		shellularState.projects = [
			{ name: "Alpha", path: "/work/alpha", addedAt: 1 },
			{ name: "Beta", path: "/work/beta", addedAt: 2 },
		] as never[];
		vi.mocked(dialog.selectProjectFile).mockResolvedValueOnce({
			projectPath: "/work/beta",
			fileName: "new.ts",
		});
		shortcutMocks.createProjectChild.mockResolvedValueOnce({
			type: "add",
			path: "/work/beta/new.ts",
			entryType: "file",
		});
		render(<DesktopShell />);

		fireEvent.keyDown(window, { key: "n", code: "KeyN", ctrlKey: true });
		await waitFor(() =>
			expect(dialog.selectProjectFile).toHaveBeenCalledOnce(),
		);
		expect(shortcutMocks.createProjectChild).toHaveBeenCalledWith(
			"/work/beta",
			"file",
			undefined,
			"new.ts",
		);
	});

	it("opens the folder picker when contextual New has no projects", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		render(<DesktopShell />);

		fireEvent.keyDown(window, { key: "n", code: "KeyN", ctrlKey: true });
		expect(shortcutMocks.openProjectPicker).toHaveBeenCalledOnce();
		expect(shortcutMocks.createProjectChild).not.toHaveBeenCalled();
	});

	it("routes VS Code navigation shortcuts and the Open Folder chord", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		shellularState.projects = [
			{
				name: "Alpha",
				path: "/work/alpha",
				addedAt: 1,
				gitInfo: { hasGit: true },
			},
		] as never[];
		render(<DesktopShell />);
		act(() =>
			openWorkbenchSurface({
				kind: "editor",
				id: "editor:/work/alpha/current.ts",
				title: "current.ts",
				icon: "icon-typescript",
				filePath: "/work/alpha/current.ts",
			}),
		);
		const activeSurfaceAction = screen.getByRole("button", {
			name: "current.ts action",
		});
		activeSurfaceAction.focus();

		fireEvent.keyDown(window, {
			key: "e",
			code: "KeyE",
			ctrlKey: true,
			shiftKey: true,
		});
		expect(screen.getByText("Projects sidebar")).toBeVisible();
		await waitFor(() =>
			expect(
				screen.getByRole("textbox", { name: "Project filter" }),
			).toHaveFocus(),
		);
		fireEvent.keyDown(window, {
			key: "e",
			code: "KeyE",
			ctrlKey: true,
			shiftKey: true,
		});
		expect(activeSurfaceAction).toHaveFocus();

		fireEvent.keyDown(window, {
			key: "f",
			code: "KeyF",
			ctrlKey: true,
			shiftKey: true,
		});
		await waitFor(() =>
			expect(shortcutMocks.requestProjectSearch).toHaveBeenCalledWith(
				"/work/alpha",
			),
		);

		fireEvent.keyDown(window, {
			key: "g",
			code: "KeyG",
			ctrlKey: true,
			shiftKey: true,
		});
		expect(screen.getByRole("button", { name: "Source Control" })).toHaveClass(
			"active",
		);

		fireEvent.keyDown(window, {
			key: ",",
			code: "Comma",
			ctrlKey: true,
		});
		expect(screen.getByRole("tab", { name: "Settings" })).toBeVisible();

		fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
		fireEvent.keyDown(window, { key: "o", code: "KeyO", ctrlKey: true });
		expect(shortcutMocks.openProjectPicker).toHaveBeenCalledOnce();
	});

	it("opens the remote file browser for Ctrl+O in desktop browsers", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		render(<DesktopShell />);

		const openFile = new KeyboardEvent("keydown", {
			key: "o",
			code: "KeyO",
			ctrlKey: true,
			cancelable: true,
		});
		window.dispatchEvent(openFile);

		expect(openFile.defaultPrevented).toBe(true);
		expect(
			await screen.findByRole("dialog", { name: "Open File" }),
		).toBeVisible();
	});

	it("routes VS Code Save, New Terminal, and Close Tab shortcuts", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		const save = vi.fn();
		shellularState.createTerminal.mockResolvedValueOnce("created");
		render(<DesktopShell />);
		const disabledSave = new KeyboardEvent("keydown", {
			key: "s",
			code: "KeyS",
			ctrlKey: true,
			cancelable: true,
		});
		window.dispatchEvent(disabledSave);
		expect(disabledSave.defaultPrevented).toBe(false);
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

		const enabledSave = new KeyboardEvent("keydown", {
			key: "s",
			code: "KeyS",
			ctrlKey: true,
			cancelable: true,
		});
		window.dispatchEvent(enabledSave);
		expect(enabledSave.defaultPrevented).toBe(true);
		await waitFor(() => expect(save).toHaveBeenCalledOnce());

		fireEvent.keyDown(window, {
			key: "`",
			code: "Backquote",
			ctrlKey: true,
			shiftKey: true,
		});
		expect(await screen.findByRole("tab", { name: "Terminal" })).toBeVisible();

		fireEvent.keyDown(window, { key: "F4", code: "F4", ctrlKey: true });
		await waitFor(() =>
			expect(screen.queryByRole("tab", { name: "Terminal" })).toBeNull(),
		);
	});

	it("toggles between the recent terminal and non-terminal with Ctrl+Backquote", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		shellularState.activeTerminals = [{ terminalId: "live" }] as never[];
		const focus = vi.fn();
		shellularState.getXterm.mockReturnValue({ focus } as never);
		render(<DesktopShell />);
		act(() => {
			openWorkbenchSurface({
				kind: "terminal",
				id: "terminal:live",
				title: "Terminal",
				icon: "icon-terminal",
				terminalId: "live",
			});
			openWorkbenchSurface({
				kind: "utility",
				id: "settings",
				page: "settings",
				title: "Settings",
				icon: "icon-settings",
			});
		});

		fireEvent.keyDown(window, {
			key: "`",
			code: "Backquote",
			ctrlKey: true,
		});
		expect(getWorkbenchSnapshot().activeId).toBe("terminal:live");
		await waitFor(() => expect(focus).toHaveBeenCalled());

		fireEvent.keyDown(window, {
			key: "`",
			code: "Backquote",
			ctrlKey: true,
		});
		expect(getWorkbenchSnapshot().activeId).toBe("settings");
	});

	it("cycles tabs and opens the keyboard shortcut settings chord", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		render(<DesktopShell />);
		act(() => {
			openWorkbenchSurface({
				kind: "utility",
				id: "first",
				page: "about",
				title: "First",
				icon: "icon-info",
			});
			openWorkbenchSurface({
				kind: "utility",
				id: "second",
				page: "settings",
				title: "Second",
				icon: "icon-settings",
			});
		});

		fireEvent.keyDown(window, {
			key: "Tab",
			code: "Tab",
			ctrlKey: true,
		});
		expect(getWorkbenchSnapshot().activeId).toBe("first");

		fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
		fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true });
		expect(
			getWorkbenchSnapshot().surfaces.find(
				(surface) => surface.id === "utility:settings",
			),
		).toMatchObject({ initialSettingsTab: "keybindings" });
	});

	it("does not steal shortcuts from terminals or unrelated inputs", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		render(<DesktopShell />);
		fireEvent.click(screen.getByRole("button", { name: "Projects" }));
		const input = screen.getByRole("textbox", { name: "Project filter" });
		fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
		fireEvent.keyDown(input, { key: "o", code: "KeyO", ctrlKey: true });
		expect(shortcutMocks.openProjectPicker).not.toHaveBeenCalled();

		const terminal = document.createElement("div");
		terminal.className = "xterm";
		const terminalInput = document.createElement("textarea");
		terminal.append(terminalInput);
		document.body.append(terminal);
		fireEvent.keyDown(terminalInput, {
			key: "n",
			code: "KeyN",
			ctrlKey: true,
		});
		fireEvent.keyDown(terminalInput, {
			key: "k",
			code: "KeyK",
			ctrlKey: true,
		});
		fireEvent.keyDown(terminalInput, {
			key: "o",
			code: "KeyO",
			ctrlKey: true,
		});
		expect(screen.queryByRole("dialog", { name: "Open File" })).toBeNull();
		fireEvent.keyDown(terminalInput, {
			key: "`",
			code: "Backquote",
			ctrlKey: true,
			shiftKey: true,
		});
		await waitFor(() =>
			expect(shellularState.createTerminal).toHaveBeenCalledOnce(),
		);
		terminal.remove();
	});

	it("suppresses shortcuts during menus, dialogs, and IME composition", async () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		vi.stubEnv("IS_BROWSER", "true");
		render(<DesktopShell showDesktopTitlebar />);

		fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
		expect(
			await screen.findByRole("menuitem", { name: "New File" }),
		).toBeVisible();
		fireEvent.keyDown(window, { key: "n", code: "KeyN", ctrlKey: true });
		expect(shortcutMocks.openProjectPicker).not.toHaveBeenCalled();
		fireEvent.keyDown(document.body, { key: "Escape" });

		const modal = document.createElement("div");
		modal.setAttribute("role", "dialog");
		modal.setAttribute("aria-modal", "true");
		document.body.append(modal);
		fireEvent.keyDown(window, { key: "n", code: "KeyN", ctrlKey: true });
		expect(shortcutMocks.openProjectPicker).not.toHaveBeenCalled();
		modal.remove();

		const composing = new KeyboardEvent("keydown", {
			key: "n",
			code: "KeyN",
			ctrlKey: true,
			cancelable: true,
		});
		Object.defineProperty(composing, "isComposing", { value: true });
		window.dispatchEvent(composing);
		expect(composing.defaultPrevented).toBe(false);
		expect(shortcutMocks.openProjectPicker).not.toHaveBeenCalled();
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

	it("reserves every close slot while exposing the control for the active tab", () => {
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

		const firstTab = screen.getByRole("tab", { name: "First" });
		const secondTab = screen.getByRole("tab", { name: "Second" });
		const firstClose = firstTab
			.closest(".workbench-tab")
			?.querySelector<HTMLButtonElement>(".workbench-tab-close");
		const secondClose = secondTab
			.closest(".workbench-tab")
			?.querySelector<HTMLButtonElement>(".workbench-tab-close");

		expect(firstClose).toBeInTheDocument();
		expect(firstClose).toHaveAttribute("aria-hidden", "true");
		expect(firstClose).toHaveAttribute("tabindex", "-1");
		expect(secondClose).toBeInTheDocument();
		expect(secondClose).toHaveAttribute("aria-hidden", "false");
		expect(secondClose).toHaveAttribute("tabindex", "0");
		expect(screen.getByRole("button", { name: "Close Second" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Close First" })).toBeNull();
		expect(screen.queryByRole("button", { name: "New terminal" })).toBeNull();

		fireEvent.click(firstTab);
		expect(firstClose).toHaveAttribute("aria-hidden", "false");
		expect(firstClose).toHaveAttribute("tabindex", "0");
		expect(secondClose).toHaveAttribute("aria-hidden", "true");
		expect(secondClose).toHaveAttribute("tabindex", "-1");
		expect(screen.getByRole("button", { name: "Close First" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Close Second" })).toBeNull();
	});

	it("preflights a pane close before killing terminals or changing layout", async () => {
		shellularState.activeTerminals = [{ terminalId: "live" }] as never[];
		vi.mocked(dialog.confirm).mockResolvedValueOnce(false);
		render(<DesktopShell />);
		act(() => {
			openWorkbenchSurface({
				kind: "terminal",
				id: "terminal:live",
				title: "Terminal",
				icon: "icon-terminal",
				terminalId: "live",
			});
			openWorkbenchSurface({
				kind: "utility",
				id: "settings",
				page: "settings",
				title: "Settings",
				icon: "icon-settings",
			});
		});

		fireEvent.click(screen.getByRole("button", { name: "Pane actions" }));
		fireEvent.click(
			await screen.findByRole("menuitem", { name: "Close Pane" }),
		);
		await waitFor(() => expect(dialog.confirm).toHaveBeenCalledOnce());
		expect(getWorkbenchSnapshot().surfaces).toHaveLength(2);
		expect(shellularState.closeTerminal).not.toHaveBeenCalled();

		vi.mocked(dialog.confirm).mockResolvedValueOnce(true);
		fireEvent.click(screen.getByRole("button", { name: "Pane actions" }));
		fireEvent.click(
			await screen.findByRole("menuitem", { name: "Close Pane" }),
		);
		await waitFor(() =>
			expect(getWorkbenchSnapshot().surfaces).toHaveLength(0),
		);
		expect(shellularState.closeTerminal).toHaveBeenCalledWith("live");
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
