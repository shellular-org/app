import { describe, expect, it, vi } from "vitest";
import { buildProjectViewMenuItems } from "./projectViewMenu";

function actions() {
	return {
		newChat: vi.fn(),
		refreshSessions: vi.fn(),
	};
}

describe("project view menu", () => {
	it("shows the project session actions", () => {
		const callbacks = actions();
		const items = buildProjectViewMenuItems(callbacks);

		expect(items.map((item) => item.label)).toEqual([
			"New Chat…",
			"Refresh Sessions",
		]);
		items[0].onClick();
		items[1].onClick();
		expect(callbacks.newChat).toHaveBeenCalledOnce();
		expect(callbacks.refreshSessions).toHaveBeenCalledOnce();
	});
});
