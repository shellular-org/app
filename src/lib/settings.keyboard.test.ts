import { beforeEach, describe, expect, it, vi } from "vitest";

const fileMock = vi.hoisted(() => ({
	exists: vi.fn(),
	read: vi.fn(),
	write: vi.fn(),
}));

vi.mock("bridge/file", () => ({ default: fileMock }));

import {
	loadSettings,
	saveSettings,
	TERMINAL_TOOLBAR_KEY_IDS,
	type TerminalKeyboardMode,
} from "./settings";

function storeRaw(settings: unknown) {
	fileMock.exists.mockResolvedValue(true);
	fileMock.read.mockResolvedValue(JSON.stringify(settings));
}

function expectValidToolbarLayout(rows: string[][]) {
	expect(rows).toHaveLength(2);
	expect(rows[0].length).toBeGreaterThan(0);
	expect(rows[1].length).toBeGreaterThan(0);

	const keys = rows.flat();
	expect(new Set(keys).size).toBe(keys.length);
	for (const key of keys) {
		expect(TERMINAL_TOOLBAR_KEY_IDS).toContain(key);
	}
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe("terminal keyboard settings", () => {
	it("upgrades legacy terminal settings to a usable keyboard configuration", async () => {
		storeRaw({ terminal: { fontSize: 19, cursorBlink: false } });

		const terminal = (await loadSettings()).terminal;

		expect(terminal.fontSize).toBe(19);
		expect(terminal.cursorBlink).toBe(false);
		expect(["terminal", "text", "numeric"]).toContain(terminal.keyboardMode);
		expectValidToolbarLayout(terminal.toolbarRows);
	});

	it.each<TerminalKeyboardMode>(["terminal", "text", "numeric"])(
		"preserves the supported %s keyboard mode",
		async (keyboardMode) => {
			storeRaw({ terminal: { keyboardMode } });

			expect((await loadSettings()).terminal.keyboardMode).toBe(keyboardMode);
		},
	);

	it.each([
		["an unknown string", "predictive"],
		["a non-string value", 7],
		["null", null],
	])("rejects %s as a keyboard mode", async (_name, keyboardMode) => {
		storeRaw({ terminal: {} });
		const legacyMode = (await loadSettings()).terminal.keyboardMode;
		storeRaw({ terminal: { keyboardMode } });

		const normalizedMode = (await loadSettings()).terminal.keyboardMode;

		expect(normalizedMode).toBe(legacyMode);
		expect(normalizedMode).not.toBe(keyboardMode);
	});

	it("removes unknown keys and duplicates across both toolbar rows", async () => {
		storeRaw({
			terminal: {
				toolbarRows: [
					["ctrl", "ctrl", "unknown", 17],
					["ctrl", "tab", "tab", null],
				],
			},
		});

		const rows = (await loadSettings()).terminal.toolbarRows;

		expect(rows).toEqual([["ctrl"], ["tab"]]);
		expectValidToolbarLayout(rows);
	});

	it.each([
		["a non-array layout", "invalid"],
		["non-array rows", [null, { key: "ctrl" }]],
		["two empty rows", [[], []]],
	])("repairs %s into two non-empty toolbar rows", async (_name, toolbarRows) => {
		storeRaw({ terminal: { toolbarRows } });

		expectValidToolbarLayout((await loadSettings()).terminal.toolbarRows);
	});

	it("moves a supported key when one row contains every available key", async () => {
		storeRaw({ terminal: { toolbarRows: [[...TERMINAL_TOOLBAR_KEY_IDS], []] } });

		const rows = (await loadSettings()).terminal.toolbarRows;

		expectValidToolbarLayout(rows);
		expect(new Set(rows.flat())).toEqual(new Set(TERMINAL_TOOLBAR_KEY_IDS));
	});

	it("persists the normalized keyboard mode and toolbar layout", async () => {
		storeRaw({ terminal: { fontSize: 19 } });

		await saveSettings({
			terminal: {
				keyboardMode: "numeric",
				toolbarRows: [["ctrl", "ctrl", "unknown"], []],
			},
		});

		const serialized = fileMock.write.mock.calls[0]?.[1];
		expect(typeof serialized).toBe("string");
		const persisted = JSON.parse(serialized as string);
		expect(persisted.terminal.keyboardMode).toBe("numeric");
		expect(persisted.terminal.toolbarRows[0]).toEqual(["ctrl"]);
		expectValidToolbarLayout(persisted.terminal.toolbarRows);
	});
});
