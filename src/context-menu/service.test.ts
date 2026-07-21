import { afterEach, describe, expect, it, vi } from "vitest";
import {
	contextMenuTriggerForEvent,
	dismissContextMenu,
	getContextMenuSnapshot,
	selectContextMenuCommand,
	showContextMenu,
} from "./service";

afterEach(() => dismissContextMenu(false));

describe("browser context-menu service", () => {
	it("distinguishes pointer and keyboard context-menu events", () => {
		expect(
			contextMenuTriggerForEvent(
				new MouseEvent("contextmenu", { button: 2, clientX: 40, clientY: 20 }),
			),
		).toBe("context");
		expect(
			contextMenuTriggerForEvent(
				new MouseEvent("contextmenu", { button: 0, ctrlKey: true }),
			),
		).toBe("context");
		expect(contextMenuTriggerForEvent(new MouseEvent("contextmenu"))).toBe(
			"keyboard",
		);
	});

	it("retains the invocation target until selection", async () => {
		const run = vi.fn();
		const completion = showContextMenu({
			menuId: "text-selection",
			anchor: { kind: "point", x: 10, y: 20 },
			trigger: "context",
			target: { handlers: { "edit.copy": { run } } },
		});
		const snapshot = getContextMenuSnapshot();
		expect(snapshot?.items).toEqual([
			expect.objectContaining({ command: "edit.copy", label: "Copy" }),
		]);
		expect(
			await selectContextMenuCommand(snapshot?.id ?? -1, "edit.copy"),
		).toBe(true);
		expect(await completion).toBe(true);
		expect(run).toHaveBeenCalledOnce();
	});

	it("cancels superseded invocations and ignores stale selections", async () => {
		const firstRun = vi.fn();
		const firstCompletion = showContextMenu({
			menuId: "text-selection",
			anchor: { kind: "point", x: 1, y: 1 },
			trigger: "context",
			target: { handlers: { "edit.copy": { run: firstRun } } },
		});
		const firstId = getContextMenuSnapshot()?.id ?? -1;
		const secondCompletion = showContextMenu({
			menuId: "text-selection",
			anchor: { kind: "point", x: 2, y: 2 },
			trigger: "context",
			target: { handlers: { "edit.copy": { run: vi.fn() } } },
		});
		expect(await firstCompletion).toBe(false);
		expect(await selectContextMenuCommand(firstId, "edit.copy")).toBe(false);
		expect(firstRun).not.toHaveBeenCalled();
		dismissContextMenu(false);
		expect(await secondCompletion).toBe(false);
	});

	it("revalidates enabled state after the menu is shown", async () => {
		let enabled = true;
		const run = vi.fn();
		const completion = showContextMenu({
			menuId: "text-selection",
			anchor: { kind: "point", x: 0, y: 0 },
			trigger: "keyboard",
			target: {
				handlers: {
					"edit.copy": { run, enabled: () => enabled },
				},
			},
		});
		const id = getContextMenuSnapshot()?.id ?? -1;
		enabled = false;
		expect(await selectContextMenuCommand(id, "edit.copy")).toBe(false);
		expect(await completion).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});
});
