import { describe, expect, it, vi } from "vitest";
import { buildProjectViewMenuItems } from "./projectViewMenu";

function actions() {
	return {
		newFile: vi.fn(),
		newFolder: vi.fn(),
		searchTree: vi.fn(),
		refreshTree: vi.fn(),
		newChat: vi.fn(),
		refreshSessions: vi.fn(),
	};
}

describe("project view menu", () => {
	it("shows only Explorer actions in Tree mode", () => {
		const callbacks = actions();
		const items = buildProjectViewMenuItems("tree", callbacks);

		expect(items.map((item) => item.label)).toEqual([
			"New File",
			"New Folder",
			"Search Files…",
			"Refresh Explorer",
		]);
		items[2].onClick();
		expect(callbacks.searchTree).toHaveBeenCalledOnce();
		items[3].onClick();
		expect(callbacks.refreshTree).toHaveBeenCalledOnce();
		expect(callbacks.refreshSessions).not.toHaveBeenCalled();
	});

	it("shows only session actions in Sessions mode", () => {
		const callbacks = actions();
		const items = buildProjectViewMenuItems("sessions", callbacks);

		expect(items.map((item) => item.label)).toEqual([
			"New Chat…",
			"Refresh Sessions",
		]);
		items[1].onClick();
		expect(callbacks.refreshSessions).toHaveBeenCalledOnce();
		expect(callbacks.refreshTree).not.toHaveBeenCalled();
	});
});
