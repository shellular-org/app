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
const localCliSnapshot = vi.hoisted(() => ({
	capability: { available: true, sandboxed: false, protocolVersion: 1 },
	cli: null,
	busy: false,
	error: null,
	phase: "idle" as const,
}));
const scrollIntoView = vi.fn();

vi.mock("bridge/dialog", () => ({
	default: { confirm: vi.fn(async () => true) },
}));
vi.mock("bridge/native", () => ({
	default: {
		setDesktopCommandHandler: vi.fn(),
		pickLocalFiles: vi.fn(async () => []),
		openInBrowser: vi.fn(async () => undefined),
	},
}));
vi.mock("components/AccountAvatarButton", () => ({
	default: ({ onClick }: { onClick: () => void }) => (
		<button type="button" onClick={onClick} aria-label="Account">
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
vi.mock("state/connection", () => ({ getHostInfo: () => null }));
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
	it("renders the desktop activity rail, direct utilities, and welcome workspace", () => {
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
			"Agents",
			"Projects",
			"Ports",
			"System Monitor",
			"Reach Out",
			"About",
			"Settings",
			"Account",
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

	it("renders a browser-only global titlebar while rail utilities stay in the sidebar", () => {
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
		expect(within(titlebar).getByText("Workbench")).toBeVisible();
		expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
		expect(screen.getByText("Surface: Settings")).toBeVisible();
		expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
	});

	it("opens rail utilities in the sidebar instead of the main tab strip", async () => {
		render(<DesktopShell />);
		const navigation = screen.getByRole("navigation", {
			name: "Workspace sections",
		});
		fireEvent.click(
			within(navigation).getByRole("button", { name: "Settings" }),
		);
		expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
		expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
		expect(screen.getByText("Surface: Settings")).toBeVisible();
		await waitFor(() => {
			expect(
				within(navigation).getByRole("button", { name: "Settings" }),
			).toHaveClass("active");
		});
	});

	it("renders active page actions in the workbench tabbar", () => {
		render(<DesktopShell />);
		fireEvent.click(
			screen.getByText("Settings").closest("button") as HTMLButtonElement,
		);
		const action = screen.getByRole("button", { name: "Settings action" });
		expect(action).toBeVisible();
		expect(action.closest(".workbench-tab-strip")).not.toBeNull();
	});
});
