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
	closeWorkbenchSurface,
	getWorkbenchSnapshot,
	openWorkbenchSurface,
	registerWorkbenchCloseGuard,
	resetWorkbench,
	restoreWorkbench,
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

	it("restores serializable tabs and drops terminals that are no longer live", async () => {
		persisted.set("shellular:desktop-workbench:host-1", {
			activeId: "terminal:dead",
			tabs: [
				settings,
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
			"terminal:live",
		]);
		expect(getWorkbenchSnapshot().activeId).toBe(settings.id);
	});
});
