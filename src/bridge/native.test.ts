import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(
	() =>
		[] as Array<{
			success: (value: unknown) => void;
			action: string;
			args: unknown[];
		}>,
);

beforeEach(() => {
	calls.length = 0;
	vi.stubGlobal("Bridge", {
		exec(
			success: (value: unknown) => void,
			_error: (error: Error) => void,
			_service: string,
			action: string,
			args: unknown[],
		) {
			calls.push({ success, action, args });
		},
	});
});

import native from "./native";

describe("desktop command bridge", () => {
	it("uses tokenized registrations and ignores events after disposal", () => {
		const handler = vi.fn();
		const dispose = native.setDesktopCommandHandler(handler);
		const registration = calls[0];
		expect(registration?.action).toBe("setDesktopCommandHandler");
		expect(registration?.args[0]).toMatch(/^desktop-command-/);

		for (const command of [
			"open-folder",
			"new-file",
			"show-explorer",
			"project-search",
			"show-source-control",
			"toggle-terminal",
			"open-keyboard-shortcuts",
		]) {
			registration?.success(command);
		}
		expect(handler.mock.calls.map(([command]) => command)).toEqual([
			"open-folder",
			"new-file",
			"show-explorer",
			"project-search",
			"show-source-control",
			"toggle-terminal",
			"open-keyboard-shortcuts",
		]);
		registration?.success(null);
		expect(handler).toHaveBeenCalledTimes(7);

		dispose();
		expect(calls[1]).toMatchObject({
			action: "clearDesktopCommandHandler",
			args: registration?.args,
		});
		registration?.success("open-folder");
		expect(handler).toHaveBeenCalledTimes(7);
	});

	it("sends contextual and resolved shortcuts to the native menu", () => {
		void native.setDesktopShortcutContext({
			contextualNew: "new-chat",
			shortcuts: {
				"contextual-new": { key: "n", modifiers: ["meta"] },
				"toggle-terminal": { key: "`", modifiers: ["ctrl"] },
				"open-folder": null,
			},
		});
		expect(calls[0]).toMatchObject({
			action: "setDesktopShortcutContext",
			args: [
				{
					contextualNew: "new-chat",
					shortcuts: {
						"contextual-new": { key: "n", modifiers: ["meta"] },
						"toggle-terminal": { key: "`", modifiers: ["ctrl"] },
						"open-folder": null,
					},
				},
			],
		});
	});
});
