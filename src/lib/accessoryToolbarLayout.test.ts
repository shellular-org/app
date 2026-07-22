import { describe, expect, it } from "vitest";
import {
	addToolbarKey,
	defaultToolbarRows,
	moveKeyLeft,
	moveKeyRight,
	moveKeyToOtherRow,
	removeToolbarKey,
	replaceToolbarKey,
	unusedToolbarKeys,
} from "./accessoryToolbarLayout";
import { DEFAULT_TERMINAL_TOOLBAR_ROWS } from "./settings";

describe("accessoryToolbarLayout", () => {
	it("lists unused keys from the default layout", () => {
		const rows = defaultToolbarRows();
		const unused = unusedToolbarKeys(rows);
		expect(unused).toEqual(
			expect.arrayContaining(["del", "interrupt"]),
		);
		expect(unused).not.toContain("esc");
		expect(unused).not.toContain("tab");
	});

	it("moves keys within a row", () => {
		const rows = [
			["esc", "tab", "ctrl"],
			["alt"],
		];
		expect(moveKeyRight(rows, { row: 0, index: 0 })).toEqual([
			["tab", "esc", "ctrl"],
			["alt"],
		]);
		expect(moveKeyLeft(rows, { row: 0, index: 2 })).toEqual([
			["esc", "ctrl", "tab"],
			["alt"],
		]);
	});

	it("moves a key to the other row without emptying a row", () => {
		const rows = [
			["esc", "tab"],
			["ctrl"],
		];
		expect(moveKeyToOtherRow(rows, { row: 0, index: 1 })).toEqual([
			["esc"],
			["ctrl", "tab"],
		]);
		// last key on a row cannot move away
		expect(moveKeyToOtherRow(rows, { row: 1, index: 0 })).toEqual(rows);
	});

	it("removes keys but keeps at least one per row", () => {
		const rows = [
			["esc", "tab"],
			["ctrl"],
		];
		expect(removeToolbarKey(rows, { row: 0, index: 0 })).toEqual([
			["tab"],
			["ctrl"],
		]);
		expect(removeToolbarKey(rows, { row: 1, index: 0 })).toEqual(rows);
	});

	it("adds unused keys to the shorter row by default", () => {
		const rows = [
			["esc", "tab", "ctrl"],
			["alt"],
		];
		expect(addToolbarKey(rows, "del")).toEqual([
			["esc", "tab", "ctrl"],
			["alt", "del"],
		]);
		expect(addToolbarKey(rows, "del", 0)).toEqual([
			["esc", "tab", "ctrl", "del"],
			["alt"],
		]);
		// already present
		expect(addToolbarKey(rows, "esc")).toEqual(rows);
	});

	it("replaces keys and swaps when the replacement is already used", () => {
		const rows = [
			["esc", "tab"],
			["ctrl", "alt"],
		];
		expect(replaceToolbarKey(rows, { row: 0, index: 0 }, "del")).toEqual([
			["del", "tab"],
			["ctrl", "alt"],
		]);
		expect(replaceToolbarKey(rows, { row: 0, index: 0 }, "ctrl")).toEqual([
			["ctrl", "tab"],
			["esc", "alt"],
		]);
	});

	it("default rows match settings defaults", () => {
		expect(defaultToolbarRows()).toEqual(
			DEFAULT_TERMINAL_TOOLBAR_ROWS.map((row) => [...row]),
		);
	});
});
