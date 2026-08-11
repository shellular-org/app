import { describe, expect, it } from "vitest";
import {
	bindingIdentifier,
	commandContextsOverlap,
	DESKTOP_MENUS,
	DesktopShortcutMatcher,
	desktopCommandEnablement,
	detectDesktopShortcutPlatform,
	findKeybindingConflicts,
	formatShortcutBinding,
	type KeybindingOverrides,
	matchesShortcutStroke,
	resolveKeybindings,
	shortcutForCommand,
} from "./desktopShortcuts";

function key(
	value: string,
	modifiers: Partial<
		Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">
	> = {},
) {
	return {
		key: value,
		code: value === "`" ? "Backquote" : value === "," ? "Comma" : "",
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		metaKey: false,
		...modifiers,
	};
}

function requiredShortcut(
	command: Parameters<typeof shortcutForCommand>[0],
	platform: Parameters<typeof shortcutForCommand>[1],
) {
	const value = shortcutForCommand(command, platform);
	if (!value) throw new Error(`Missing ${platform} shortcut for ${command}`);
	return value;
}

describe("desktop VS Code shortcuts", () => {
	it("keeps menu labels and enablement in the command registry", () => {
		const file = DESKTOP_MENUS.find((menu) => menu.label === "File");
		expect(file?.items.map(({ command, label }) => [command, label])).toEqual([
			["new-file", "New File"],
			["new-chat", "New Chat"],
			["new-terminal", "New Terminal"],
			["open-file", "Open File…"],
			["open-folder", "Open Folder…"],
			["save", "Save"],
			["close-tab", "Close Tab"],
		]);
		expect(desktopCommandEnablement("save")).toBe("save");
		expect(desktopCommandEnablement("open-file")).toBe("always");
		expect(desktopCommandEnablement("redo")).toBe("editable");
	});

	it("detects macOS, Windows, and Linux independently", () => {
		expect(
			detectDesktopShortcutPlatform({
				platform: "MacIntel",
				userAgent: "Mozilla",
			}),
		).toBe("mac");
		expect(
			detectDesktopShortcutPlatform({
				platform: "Win32",
				userAgent: "Mozilla",
			}),
		).toBe("windows");
		expect(
			detectDesktopShortcutPlatform({
				platform: "Linux x86_64",
				userAgent: "Mozilla",
			}),
		).toBe("linux");
	});

	it("requires exact modifiers", () => {
		expect(
			matchesShortcutStroke(key("n", { metaKey: true }), {
				key: "n",
				modifiers: ["meta"],
			}),
		).toBe(true);
		expect(
			matchesShortcutStroke(key("n", { metaKey: true, shiftKey: true }), {
				key: "n",
				modifiers: ["meta"],
			}),
		).toBe(false);
	});

	it("uses the VS Code platform differences for close and redo", () => {
		expect(
			formatShortcutBinding(requiredShortcut("close-tab", "mac"), "mac"),
		).toBe("⌘W");
		expect(
			formatShortcutBinding(
				requiredShortcut("close-tab", "windows"),
				"windows",
			),
		).toBe("Ctrl+F4");
		expect(
			formatShortcutBinding(requiredShortcut("redo", "windows"), "windows"),
		).toBe("Ctrl+Y");
		expect(
			formatShortcutBinding(requiredShortcut("redo", "linux"), "linux"),
		).toBe("Ctrl+Y");
	});

	it("resolves and cancels the Open Folder chord", () => {
		const matcher = new DesktopShortcutMatcher("mac");
		expect(matcher.handle(key("k", { metaKey: true }))).toEqual({
			type: "pending",
		});
		expect(matcher.handle(key("o", { metaKey: true }))).toEqual({
			type: "command",
			command: "open-folder",
		});

		expect(matcher.handle(key("k", { metaKey: true }))).toEqual({
			type: "pending",
		});
		expect(matcher.handle(key("x", { metaKey: true }))).toEqual({
			type: "none",
		});
		expect(matcher.handle(key("o", { metaKey: true }))).toEqual({
			type: "command",
			command: "open-file",
		});

		expect(matcher.handle(key("k", { metaKey: true }))).toEqual({
			type: "pending",
		});
		expect(matcher.hasPendingChord()).toBe(true);
		expect(matcher.handle(key("Escape"))).toEqual({ type: "none" });
		expect(matcher.hasPendingChord()).toBe(false);
	});

	it("maps New Terminal to Control+Shift+Backquote on macOS", () => {
		const matcher = new DesktopShortcutMatcher("mac");
		expect(matcher.handle(key("`", { ctrlKey: true }))).toEqual({
			type: "command",
			command: "toggle-terminal",
		});
		expect(matcher.handle(key("`", { ctrlKey: true, shiftKey: true }))).toEqual(
			{ type: "command", command: "new-terminal" },
		);
		expect(matcher.handle(key("n", { metaKey: true }))).toEqual({
			type: "command",
			command: "contextual-new",
		});
		expect(matcher.handle(key("n", { metaKey: true, shiftKey: true }))).toEqual(
			{ type: "none" },
		);
	});

	it("resolves live multiple-binding overrides and explicit unbinding", () => {
		const overrides = {
			linux: {
				settings: [
					{ strokes: [{ key: "F6" }] },
					{ strokes: [{ key: ",", modifiers: ["ctrl", "shift"] }] },
				],
				"toggle-sidebar": [],
			},
		} satisfies KeybindingOverrides;
		const resolved = resolveKeybindings("linux", overrides);
		expect(resolved.settings.map(bindingIdentifier)).toEqual([
			"F6",
			"ctrl+shift+,",
		]);
		expect(resolved["toggle-sidebar"]).toEqual([]);

		const matcher = new DesktopShortcutMatcher("linux", overrides);
		expect(matcher.handle(key("F6"))).toEqual({
			type: "command",
			command: "settings",
		});
		expect(matcher.handle(key("b", { ctrlKey: true }))).toEqual({
			type: "none",
		});
	});

	it("finds only conflicts whose command contexts overlap", () => {
		const resolved = resolveKeybindings("mac", {
			mac: {
				settings: [{ strokes: [{ key: "F12" }] }],
			},
		});
		expect(
			findKeybindingConflicts(
				"editor.definition",
				{ strokes: [{ key: "F12" }] },
				resolved,
			),
		).toContain("settings");
		expect(commandContextsOverlap("editor.definition", "settings")).toBe(true);
		expect(commandContextsOverlap("editor.definition", "new-file")).toBe(true);
	});

	it("does not retain the non-VS Code Windows Ctrl+W alias", () => {
		const matcher = new DesktopShortcutMatcher("windows");
		expect(matcher.handle(key("w", { ctrlKey: true }))).toEqual({
			type: "none",
		});
		expect(matcher.handle(key("F4", { ctrlKey: true }))).toEqual({
			type: "command",
			command: "close-tab",
		});
	});
});
