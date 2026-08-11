import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
	exists: false,
	text: "",
	writes: [] as string[],
}));

vi.mock("bridge/file", () => ({
	default: {
		exists: vi.fn(async () => storage.exists),
		read: vi.fn(async () => storage.text),
		write: vi.fn(async (_path: string, text: string) => {
			storage.writes.push(text);
		}),
	},
}));

import {
	getKeybindingsSnapshot,
	initializeKeybindings,
	resetCommandKeybindings,
	resetKeybindingsForTests,
	resolvedKeybindings,
	setCommandKeybindings,
} from "./keybindings";

describe("keybinding persistence", () => {
	beforeEach(() => {
		storage.exists = false;
		storage.text = "";
		storage.writes = [];
		resetKeybindingsForTests();
	});

	it("falls back to defaults when no file exists", async () => {
		await initializeKeybindings();
		expect(getKeybindingsSnapshot().initialized).toBe(true);
		expect(resolvedKeybindings("linux")["toggle-terminal"]).toEqual([
			{
				strokes: [{ key: "`", modifiers: ["ctrl"] }],
			},
		]);
	});

	it("normalizes valid platform overrides and ignores malformed entries", async () => {
		storage.exists = true;
		storage.text = JSON.stringify({
			version: 1,
			overrides: {
				mac: {
					"toggle-terminal": [
						{
							strokes: [{ key: "T", modifiers: ["meta", "shift", "bogus"] }],
						},
					],
					unknown: [{ strokes: [{ key: "q" }] }],
					settings: [{ strokes: [] }],
				},
			},
		});
		await initializeKeybindings();
		expect(resolvedKeybindings("mac")["toggle-terminal"]).toEqual([
			{
				strokes: [{ key: "t", modifiers: ["shift", "meta"] }],
			},
		]);
		expect(resolvedKeybindings("mac").settings).toEqual([
			{ strokes: [{ key: ",", modifiers: ["meta"] }] },
		]);
	});

	it("persists explicit unbinding and reset restores the default", async () => {
		await initializeKeybindings();
		await setCommandKeybindings("windows", "settings", []);
		expect(resolvedKeybindings("windows").settings).toEqual([]);
		expect(
			JSON.parse(storage.writes[storage.writes.length - 1] ?? "{}"),
		).toMatchObject({
			version: 1,
			overrides: { windows: { settings: [] } },
		});

		await resetCommandKeybindings("windows", "settings");
		expect(resolvedKeybindings("windows").settings).toEqual([
			{ strokes: [{ key: ",", modifiers: ["ctrl"] }] },
		]);
	});
});
