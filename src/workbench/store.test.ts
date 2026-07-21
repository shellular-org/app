import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted = new Map<string, unknown>();

vi.mock("lib/store", () => ({
	get: vi.fn(async (key: string) => persisted.get(key) ?? null),
	set: vi.fn(async (key: string, value: unknown) => {
		persisted.set(key, value);
	}),
}));

import {
	activateWorkbenchSurface,
	canExecuteWorkbenchSurfaceCommand,
	closeWorkbenchDialog,
	closeWorkbenchSurface,
	executeWorkbenchSurfaceCommand,
	getWorkbenchSnapshot,
	openWorkbenchDialog,
	openWorkbenchSurface,
	registerWorkbenchCloseGuard,
	registerWorkbenchCommandHandlers,
	registerWorkbenchSaveHandler,
	resetWorkbench,
	restoreWorkbench,
	saveWorkbenchSurface,
	updateWorkbenchSurface,
} from "./store";

const settings = {
	kind: "utility" as const,
	id: "utility:settings",
	page: "settings" as const,
	title: "Settings",
	icon: "icon-settings",
};

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

		expect(getWorkbenchSnapshot().tabs).toHaveLength(2);
		expect(getWorkbenchSnapshot().tabs[0].title).toBe("Preferences");
		activateWorkbenchSurface(settings.id);
		expect(getWorkbenchSnapshot().activeId).toBe(settings.id);

		await closeWorkbenchSurface(settings.id);
		expect(getWorkbenchSnapshot().activeId).toBe("utility:ports");
	});

	it("honors asynchronous close guards", async () => {
		openWorkbenchSurface(settings);
		registerWorkbenchCloseGuard(settings.id, async () => false);
		expect(await closeWorkbenchSurface(settings.id)).toBe(false);
		expect(getWorkbenchSnapshot().tabs).toHaveLength(1);
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
				tabs: Array<Record<string, unknown>>;
			};
			expect(saved.tabs).toHaveLength(1);
			expect(saved.tabs[0].id).toBe(settings.id);
			expect(saved.tabs[0]).not.toHaveProperty("dirty");
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
		expect(getWorkbenchSnapshot().tabs.map((tab) => tab.id)).toEqual([
			settings.id,
			"files:/repo",
			"terminal:live",
		]);
		expect(getWorkbenchSnapshot().activeId).toBe(settings.id);
	});
});
