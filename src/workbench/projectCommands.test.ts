import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProjectMenuItems } from "./projectCommands";

const handlers = {
	onNewChat: vi.fn(),
	onExplore: vi.fn(),
	onGit: vi.fn(),
	onShellularTerminal: vi.fn(),
	onRemove: vi.fn(),
	onOpenInEditor: vi.fn(),
	onReveal: vi.fn(),
	onOpenSystemTerminal: vi.fn(),
};

const project = {
	name: "Shellular",
	path: "/work/Shellular",
	addedAt: 1,
	gitInfo: { hasGit: true },
};

const capabilities = {
	localWorkspace: true,
	editors: [],
	canReveal: true,
	canOpenSystemTerminal: false,
};

const previousPlatform = process.env.PLATFORM;

afterEach(() => {
	process.env.PLATFORM = previousPlatform;
	vi.clearAllMocks();
});

describe("project menu commands", () => {
	it("keeps Explore as the in-app file browser action", () => {
		const items = buildProjectMenuItems(project, [], capabilities, handlers);
		const explore = items.find((item) => item.label === "Explore");

		expect(explore).toMatchObject({
			icon: "icon-folder",
			onClick: handlers.onExplore,
		});
	});

	it("labels native reveal as Finder on macOS", () => {
		process.env.PLATFORM = "macos";
		const items = buildProjectMenuItems(project, [], capabilities, handlers);

		expect(
			items.find((item) => item.label === "Reveal in Finder"),
		).toMatchObject({
			icon: "icon-external-link",
			onClick: handlers.onReveal,
		});
	});
});
