import type { DesktopKeyboardCommand } from "./desktopShortcuts";

type DesktopCommandListener = (command: DesktopKeyboardCommand) => void;

const listeners = new Set<DesktopCommandListener>();

export function requestDesktopKeyboardCommand(command: DesktopKeyboardCommand) {
	for (const listener of listeners) listener(command);
}

export function subscribeDesktopKeyboardCommands(
	listener: DesktopCommandListener,
) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
