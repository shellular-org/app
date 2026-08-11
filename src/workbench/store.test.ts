import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted = new Map<string, unknown>();

vi.mock("lib/store", () => ({
	get: vi.fn(async (key: string) => persisted.get(key) ?? null),
	set: vi.fn(async (key: string, value: unknown) => {
		persisted.set(key, value);
	}),
}));

import {
	findWorkbenchGroup,
	findWorkbenchTab,
	workbenchGroups,
} from "./layoutTree";
import {
	activateWorkbenchSurface,
	canExecuteWorkbenchSurfaceCommand,
	closeWorkbenchDialog,
	closeWorkbenchSurface,
	closeWorkbenchSurfaces,
	commitCloseWorkbenchSurfaces,
	executeWorkbenchSurfaceCommand,
	focusWorkbenchGroup,
	getWorkbenchSnapshot,
	moveWorkbenchSurface,
	openWorkbenchDialog,
	openWorkbenchSurface,
	registerWorkbenchCloseGuard,
	registerWorkbenchCommandHandlers,
	registerWorkbenchSaveHandler,
	resetWorkbench,
	restoreWorkbench,
	saveWorkbenchSurface,
	setWorkbenchSurfacePinned,
	splitWorkbenchSurface,
	updateWorkbenchSurface,
} from "./store";

const settings = {
	kind: "utility" as const,
	id: "utility:settings",
	page: "settings" as const,
	title: "Settings",
	icon: "icon-settings",
};

function groupIdFor(surfaceId: string) {
	const location = findWorkbenchTab(getWorkbenchSnapshot().root, surfaceId);
	if (!location) throw new Error(`Missing workbench tab ${surfaceId}`);
	return location.group.id;
}

beforeEach(() => {
	persisted.clear();
	resetWorkbench();
});

describe("desktop workbench store", () => {
	it("opens, deduplicates, activates, and chooses an adjacent tab on close", async () => {
		openWorkbenchSurface(settings);
		openWorkbenchSurface({ ...settings, title: "Preferences" });
		openWorkbenchSurface({
			kind: "utility",
			id: "utility:ports",
			page: "ports",
			title: "Ports",
			icon: "icon-power-cord",
		});

		expect(getWorkbenchSnapshot().surfaces).toHaveLength(2);
		expect(getWorkbenchSnapshot().surfaces[0].title).toBe("Preferences");
		activateWorkbenchSurface(settings.id);
		expect(getWorkbenchSnapshot().activeId).toBe(settings.id);

		await closeWorkbenchSurface(settings.id);
		expect(getWorkbenchSnapshot().activeId).toBe("utility:ports");
	});

	it("honors asynchronous close guards", async () => {
		openWorkbenchSurface(settings);
		registerWorkbenchCloseGuard(settings.id, async () => false);
		expect(await closeWorkbenchSurface(settings.id)).toBe(false);
		expect(getWorkbenchSnapshot().surfaces).toHaveLength(1);
	});

	it("opens and closes non-persisted dialogs", () => {
		openWorkbenchDialog(settings);
		expect(getWorkbenchSnapshot().dialog?.id).toBe(settings.id);
		closeWorkbenchDialog(settings.id);
		expect(getWorkbenchSnapshot().dialog).toBeNull();
	});

	it("dispatches Save only to the registered active surface handler", async () => {
		const save = vi.fn();
		openWorkbenchSurface(settings);
		const unregister = registerWorkbenchSaveHandler(settings.id, save);
		expect(await saveWorkbenchSurface(settings.id)).toBe(true);
		expect(save).toHaveBeenCalledOnce();
		unregister();
		expect(await saveWorkbenchSurface(settings.id)).toBe(false);
	});

	it("tracks enabled editing commands per workbench surface", async () => {
		const undo = vi.fn();
		let enabled = false;
		const unregister = registerWorkbenchCommandHandlers(settings.id, {
			undo: { run: undo, enabled: () => enabled },
		});
		expect(canExecuteWorkbenchSurfaceCommand(settings.id, "undo")).toBe(false);
		expect(await executeWorkbenchSurfaceCommand(settings.id, "undo")).toBe(
			false,
		);
		enabled = true;
		expect(canExecuteWorkbenchSurfaceCommand(settings.id, "undo")).toBe(true);
		expect(await executeWorkbenchSurfaceCommand(settings.id, "undo")).toBe(
			true,
		);
		expect(undo).toHaveBeenCalledOnce();
		unregister();
		expect(canExecuteWorkbenchSurfaceCommand(settings.id, "undo")).toBe(false);
	});

	it("does not persist dirty runtime state or transient comparison payloads", async () => {
		persisted.set("shellular:desktop-workbench:host-1", { tabs: [] });
		await restoreWorkbench("host-1");
		openWorkbenchSurface(settings);
		updateWorkbenchSurface(settings.id, { dirty: true });
		openWorkbenchSurface({
			kind: "editor",
			id: "agent-diff:1",
			title: "app.ts",
			icon: "icon-file",
			filePath: "app.ts",
			restorable: false,
			comparison: {
				kind: "inline",
				workspacePath: "/repo",
				relativePath: "app.ts",
				sourceId: "1",
				oldText: "large old payload",
				newText: "large new payload",
			},
		});
		await vi.waitFor(() => {
			const saved = persisted.get("shellular:desktop-workbench:host-1") as {
				version: number;
				surfaces: Array<Record<string, unknown>>;
			};
			expect(saved.version).toBe(2);
			expect(saved.surfaces).toHaveLength(1);
			expect(saved.surfaces[0].id).toBe(settings.id);
			expect(saved.surfaces[0]).not.toHaveProperty("dirty");
		});
	});

	it("restores utility, files, and live terminal tabs while dropping dead terminals", async () => {
		persisted.set("shellular:desktop-workbench:host-1", {
			activeId: "terminal:dead",
			tabs: [
				settings,
				{
					kind: "files",
					id: "files:/repo",
					title: "repo",
					icon: "icon-folder",
					initialPath: "/repo",
					mode: "project",
				},
				{
					kind: "terminal",
					id: "terminal:live",
					title: "Terminal",
					icon: "icon-terminal",
					terminalId: "live",
				},
				{
					kind: "terminal",
					id: "terminal:dead",
					title: "Terminal",
					icon: "icon-terminal",
					terminalId: "dead",
				},
			],
		});

		await restoreWorkbench("host-1", new Set(["live"]));
		expect(getWorkbenchSnapshot().surfaces.map((tab) => tab.id)).toEqual([
			settings.id,
			"files:/repo",
			"terminal:live",
		]);
		expect(getWorkbenchSnapshot().activeId).toBe(settings.id);
	});

	it("restores version 2 nesting, focus, ratios, and pin state per host", async () => {
		const ports = {
			kind: "utility" as const,
			id: "utility:ports",
			page: "ports" as const,
			title: "Ports",
			icon: "icon-power-cord",
		};
		persisted.set("shellular:desktop-workbench:host-v2", {
			version: 2,
			surfaces: [settings, ports],
			focusedGroupId: "group:ports",
			root: {
				type: "split",
				id: "split:root",
				orientation: "horizontal",
				ratio: 0.65,
				first: {
					type: "group",
					id: "group:settings",
					tabs: [{ surfaceId: settings.id, pinned: true }],
					activeId: settings.id,
				},
				second: {
					type: "group",
					id: "group:ports",
					tabs: [{ surfaceId: ports.id, pinned: false }],
					activeId: ports.id,
				},
			},
		});

		await restoreWorkbench("host-v2");
		const state = getWorkbenchSnapshot();
		expect(state.root.type).toBe("split");
		expect(state.root.type === "split" && state.root.ratio).toBe(0.65);
		expect(state.focusedGroupId).toBe("group:ports");
		expect(state.activeId).toBe(ports.id);
		expect(findWorkbenchTab(state.root, settings.id)?.tab.pinned).toBe(true);

		await restoreWorkbench("another-host");
		expect(getWorkbenchSnapshot().surfaces).toHaveLength(0);
		await restoreWorkbench("host-v2");
		expect(getWorkbenchSnapshot().activeId).toBe(ports.id);
	});

	it("moves, splits, focuses, and pins tabs using stable group IDs", () => {
		openWorkbenchSurface(settings);
		openWorkbenchSurface({
			kind: "utility",
			id: "utility:ports",
			page: "ports",
			title: "Ports",
			icon: "icon-power-cord",
		});
		expect(splitWorkbenchSurface("utility:ports", "group:root", "right")).toBe(
			true,
		);
		let state = getWorkbenchSnapshot();
		const groups = workbenchGroups(state.root);
		expect(groups).toHaveLength(2);
		const portsGroup = findWorkbenchTab(state.root, "utility:ports")?.group.id;
		expect(portsGroup).toBeTruthy();
		if (!portsGroup) throw new Error("Missing ports group");

		focusWorkbenchGroup("group:root");
		setWorkbenchSurfacePinned(settings.id, true);
		expect(
			findWorkbenchTab(getWorkbenchSnapshot().root, settings.id)?.tab.pinned,
		).toBe(true);
		expect(moveWorkbenchSurface(settings.id, portsGroup)).toBe(true);
		state = getWorkbenchSnapshot();
		expect(state.root.type).toBe("group");
		expect(state.focusedGroupId).toBe(portsGroup);
		expect(findWorkbenchGroup(state.root, portsGroup)?.tabs[0]).toEqual({
			surfaceId: settings.id,
			pinned: true,
		});
	});

	it("preflights every close guard before committing a batch", async () => {
		openWorkbenchSurface(settings);
		openWorkbenchSurface({
			kind: "utility",
			id: "utility:ports",
			page: "ports",
			title: "Ports",
			icon: "icon-power-cord",
		});
		const first = vi.fn(async () => true);
		const second = vi.fn(async () => false);
		registerWorkbenchCloseGuard(settings.id, first);
		registerWorkbenchCloseGuard("utility:ports", second);
		expect(
			await closeWorkbenchSurfaces([settings.id, "utility:ports"], {
				reason: "pane",
			}),
		).toBe(false);
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
		expect(getWorkbenchSnapshot().surfaces).toHaveLength(2);

		commitCloseWorkbenchSurfaces([settings.id, "utility:ports"]);
		expect(getWorkbenchSnapshot().surfaces).toHaveLength(0);
		expect(getWorkbenchSnapshot().root.type).toBe("group");
	});

	it("focuses the nearest surviving sibling when a pane collapses", () => {
		openWorkbenchSurface({ ...settings, id: "a", title: "A" });
		openWorkbenchSurface({ ...settings, id: "b", title: "B" });
		openWorkbenchSurface({ ...settings, id: "c", title: "C" });
		splitWorkbenchSurface("b", "group:root", "right");
		const bGroup = groupIdFor("b");
		splitWorkbenchSurface("c", bGroup, "down");
		const cGroup = groupIdFor("c");
		focusWorkbenchGroup(cGroup);

		commitCloseWorkbenchSurfaces(["c"]);
		expect(getWorkbenchSnapshot().focusedGroupId).toBe(bGroup);
		expect(getWorkbenchSnapshot().activeId).toBe("b");
	});
});
