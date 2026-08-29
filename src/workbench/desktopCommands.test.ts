import { expect, it, vi } from "vitest";
import {
	requestDesktopKeyboardCommand,
	subscribeDesktopKeyboardCommands,
} from "./desktopCommands";

it("routes editor-owned keybindings through the desktop dispatcher", () => {
	const listener = vi.fn();
	const unsubscribe = subscribeDesktopKeyboardCommands(listener);

	requestDesktopKeyboardCommand("save");
	requestDesktopKeyboardCommand("open-folder");
	expect(listener.mock.calls.map(([command]) => command)).toEqual([
		"save",
		"open-folder",
	]);

	unsubscribe();
	requestDesktopKeyboardCommand("save");
	expect(listener).toHaveBeenCalledTimes(2);
});
