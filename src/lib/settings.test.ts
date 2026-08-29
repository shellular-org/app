import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ text: "" }));

vi.mock("bridge/file", () => ({
	default: {
		exists: vi.fn(async () => true),
		read: vi.fn(async () => storage.text),
		write: vi.fn(async () => undefined),
	},
}));

import { loadSettings } from "./settings";

describe("editor settings migration", () => {
	beforeEach(() => {
		storage.text = JSON.stringify({ editor: { fontSize: 16, tabSize: 2 } });
	});

	it("defaults new desktop Monaco options for older settings files", async () => {
		const settings = await loadSettings();
		expect(settings.editor).toMatchObject({
			fontSize: 16,
			tabSize: 2,
			minimap: true,
			stickyScroll: true,
		});
	});

	it("preserves explicit Monaco preferences", async () => {
		storage.text = JSON.stringify({
			editor: { minimap: false, stickyScroll: false },
		});
		const settings = await loadSettings();
		expect(settings.editor.minimap).toBe(false);
		expect(settings.editor.stickyScroll).toBe(false);
	});
});
