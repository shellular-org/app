import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KeyboardShortcutsSettings from "./KeyboardShortcutsSettings";

const mocks = vi.hoisted(() => ({
	apply: vi.fn(async () => undefined),
	set: vi.fn(async () => undefined),
	resetAll: vi.fn(async () => undefined),
	confirm: vi.fn(async () => true),
	snapshot: {
		initialized: true,
		revision: 1,
		overrides: {},
	},
}));

vi.mock("lib/keybindings", () => ({
	applyKeybindingChanges: mocks.apply,
	getKeybindingsSnapshot: () => mocks.snapshot,
	initializeKeybindings: vi.fn(async () => mocks.snapshot),
	resetPlatformKeybindings: mocks.resetAll,
	setCommandKeybindings: mocks.set,
	subscribeKeybindings: () => () => undefined,
}));

vi.mock("bridge/dialog", () => ({
	default: {
		confirm: mocks.confirm,
	},
}));

vi.mock("lib/toast", () => ({ default: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("KeyboardShortcutsSettings", () => {
	it("searches commands and records a replacement after conflict confirmation", async () => {
		render(<KeyboardShortcutsSettings query="settings" />);
		expect(screen.getByText("Settings")).toBeVisible();
		expect(screen.queryByText("New Terminal")).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: "Add shortcut for Settings" }),
		);
		expect(
			screen.getByRole("dialog", { name: "Record keyboard shortcut" }),
		).toBeVisible();
		fireEvent.keyDown(document, { key: "F12", code: "F12" });
		expect(screen.getByText("F12")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
		expect(mocks.apply).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				set: expect.objectContaining({
					settings: expect.arrayContaining([
						{ strokes: [{ key: "F12", modifiers: [] }] },
					]),
					"editor.definition": [],
				}),
			}),
		);
	});

	it("cancels recording with Escape", () => {
		render(<KeyboardShortcutsSettings query="terminal" />);
		fireEvent.click(
			screen.getByRole("button", {
				name: "Add shortcut for Toggle Terminal",
			}),
		);
		fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
		expect(
			screen.queryByRole("dialog", { name: "Record keyboard shortcut" }),
		).toBeNull();
		expect(mocks.apply).not.toHaveBeenCalled();
	});
});
