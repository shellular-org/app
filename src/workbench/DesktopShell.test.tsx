import {
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
}));
const scrollIntoView = vi.fn();

vi.mock("bridge/dialog", () => ({
	default: { confirm: vi.fn(async () => true) },
}));
vi.mock("components/AccountAvatarButton", () => ({
	default: ({ onClick }: { onClick: () => void }) => (
		<button type="button" onClick={onClick} aria-label="Account">
			AK
		</button>
	),
}));
vi.mock("state", () => ({
	useShellular: () => shellularState,
}));
vi.mock("state/connection", () => ({ getHostInfo: () => null }));
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
vi.mock("./SurfaceRenderer", () => ({
	default: ({ surface }: { surface: { title: string } }) => (
		<div>Surface: {surface.title}</div>
	),
}));

import DesktopShell from "./DesktopShell";
import { resetWorkbench } from "./store";

beforeEach(() => {
	vi.clearAllMocks();
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

afterEach(cleanup);

describe("desktop shell", () => {
	it("renders the activity rail, sidebar, and welcome workspace without a terminal activity", () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		expect(
			within(navigation).getByRole("button", { name: "Home" }),
		).toBeVisible();
		expect(
			within(navigation).getByRole("button", { name: "Agents" }),
		).toBeVisible();
		expect(
			within(navigation).getByRole("button", { name: "Projects" }),
		).toBeVisible();
		expect(
			within(navigation).queryByRole("button", { name: "Terminal" }),
		).toBeNull();
		expect(
			within(navigation).getByRole("button", { name: "Account" }),
		).toBeVisible();
		const railButtons = within(navigation).getAllByRole("button");
		expect(railButtons[railButtons.length - 1]).toHaveAccessibleName("Account");
		expect(screen.getByText("Home sidebar")).toBeVisible();
		expect(screen.getByRole("heading", { name: "Shellular" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Close sidebar" })).toBeNull();

		fireEvent.click(within(navigation).getByRole("button", { name: "Home" }));
		expect(screen.queryByText("Home sidebar")).toBeNull();
		fireEvent.click(within(navigation).getByRole("button", { name: "Home" }));
		expect(screen.getByText("Home sidebar")).toBeVisible();
	});

	it("omits account and settings from the desktop More sidebar", () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		fireEvent.click(within(navigation).getByRole("button", { name: "More" }));

		expect(screen.getByText("Manage forwarded services")).toBeVisible();
		expect(screen.queryByText("Preferences and configuration")).toBeNull();
		expect(screen.queryByText("Account and connected devices")).toBeNull();
	});

	it("uses the compact agents sidebar presentation", () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		fireEvent.click(within(navigation).getByRole("button", { name: "Agents" }));
		expect(screen.getByText("Agents sidebar")).toHaveAttribute(
			"data-compact",
			"true",
		);
	});

	it("renders a browser-only global titlebar with active context", () => {
		render(<DesktopShell showBrowserTitlebar />);
		const titlebar = screen.getByRole("banner");
		expect(within(titlebar).getByText("Shellular")).toBeVisible();
		expect(within(titlebar).getByText("Workbench")).toBeVisible();

		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		fireEvent.click(
			within(navigation).getByRole("button", { name: "Settings" }),
		);
		expect(within(titlebar).getByText("Settings")).toBeVisible();
	});

	it("opens singleton utilities and reveals the active tab", async () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		fireEvent.click(
			within(navigation).getByRole("button", { name: "Settings" }),
		);
		expect(screen.getByRole("tab", { name: "Settings" })).toBeVisible();
		expect(screen.getByText("Surface: Settings")).toBeVisible();
		await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
	});
});
