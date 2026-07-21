import { beforeEach, describe, expect, it, vi } from "vitest";
import { canRunDomEditCommand, runDomEditCommand } from "./domEditCommands";

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("desktop DOM editing commands", () => {
	it("pastes into the focused text control without losing its selection", async () => {
		const input = document.createElement("textarea");
		input.value = "hello world";
		document.body.append(input);
		input.setSelectionRange(6, 11);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { readText: vi.fn(async () => "Shellular") },
		});

		expect(canRunDomEditCommand("paste", input)).toBe(true);
		expect(await runDomEditCommand("paste", input)).toBe(true);
		expect(input.value).toBe("hello Shellular");
		input.remove();
	});

	it("disables destructive editing for readonly controls", () => {
		const input = document.createElement("input");
		input.readOnly = true;
		expect(canRunDomEditCommand("cut", input)).toBe(false);
		expect(canRunDomEditCommand("paste", input)).toBe(false);
	});
});
