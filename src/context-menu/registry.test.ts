import { describe, expect, it, vi } from "vitest";
import {
	executeContextCommand,
	formatShortcut,
	registerCommandDefinition,
	resolveCommandGroups,
	resolveContextMenu,
} from "./registry";

describe("context-menu registry", () => {
	it("removes empty groups and duplicate separators", () => {
		const items = resolveContextMenu(
			"text-edit",
			{
				handlers: {
					"edit.copy": { run: vi.fn() },
					"edit.selectAll": { run: vi.fn() },
				},
			},
			"mac",
		);
		expect(
			items.map((item) => (item.type === "command" ? item.command : item.type)),
		).toEqual(["edit.copy", "separator", "edit.selectAll"]);
	});

	it("resolves labels, state, shortcuts, and checked radio items at invocation time", () => {
		const dispose = registerCommandDefinition({
			id: "test.dynamic",
			label: "Fallback",
			shortcuts: {
				mac: { key: "k", modifiers: ["meta", "shift"] },
				windowsLinux: { key: "k", modifiers: ["ctrl"] },
			},
		});
		try {
			const items = resolveCommandGroups(
				[["test.dynamic"]],
				{
					handlers: {
						"test.dynamic": {
							run: vi.fn(),
							label: () => "Current label",
							checked: () => true,
							enabled: () => false,
						},
					},
				},
				"mac",
			);
			expect(items).toEqual([
				expect.objectContaining({
					type: "command",
					label: "Current label",
					checked: true,
					disabled: true,
					shortcutLabel: "⇧⌘K",
				}),
			]);
		} finally {
			dispose();
		}
	});

	it("revalidates enabled and visible state before execution", async () => {
		const run = vi.fn();
		let enabled = true;
		const target = {
			handlers: {
				"edit.copy": { run, enabled: () => enabled },
			},
		};
		enabled = false;
		expect(await executeContextCommand(target, "edit.copy")).toBe(false);
		expect(run).not.toHaveBeenCalled();
		enabled = true;
		expect(await executeContextCommand(target, "edit.copy")).toBe(true);
		expect(run).toHaveBeenCalledOnce();
	});

	it("formats platform shortcuts", () => {
		expect(formatShortcut({ key: "c", modifiers: ["meta"] }, "mac")).toBe("⌘C");
		expect(
			formatShortcut({ key: "F12", modifiers: ["shift"] }, "windowsLinux"),
		).toBe("Shift+F12");
	});
});
