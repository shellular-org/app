export interface TerminalCommandInputState {
	line: string;
	shouldCaptureVisibleCommand: boolean;
}

export interface TerminalInputCommandResult {
	commands: string[];
	clearHistory: boolean;
	captureCurrentLine?: boolean;
}

export function createTerminalCommandInputState(): TerminalCommandInputState {
	return { line: "", shouldCaptureVisibleCommand: false };
}

export function applyTerminalInputToCommandState(
	state: TerminalCommandInputState,
	data: string,
): TerminalInputCommandResult {
	const commands: string[] = [];
	let clearHistory = false;
	let captureCurrentLine = false;

	for (let i = 0; i < data.length; i++) {
		const char = data[i];

		if (char === "\r" || char === "\n") {
			const command = state.line.trim();
			const shouldCaptureVisibleCommand = state.shouldCaptureVisibleCommand;
			state.line = "";
			state.shouldCaptureVisibleCommand = false;
			if (!command) {
				captureCurrentLine ||= shouldCaptureVisibleCommand;
				continue;
			}
			if (isBufferClearingCommand(command)) {
				clearHistory = true;
				commands.length = 0;
				continue;
			}
			if (shouldCaptureVisibleCommand) {
				captureCurrentLine = true;
				continue;
			}
			commands.push(command);
			continue;
		}

		if (char === "\x03") {
			state.line = "";
			state.shouldCaptureVisibleCommand = false;
			continue;
		}

		if (char === "\x15") {
			state.line = "";
			state.shouldCaptureVisibleCommand = false;
			continue;
		}

		if (char === "\x1f") {
			state.line = "";
			state.shouldCaptureVisibleCommand = false;
			continue;
		}

		if (char === "\x0c") {
			clearHistory = true;
			captureCurrentLine = false;
			commands.length = 0;
			state.line = "";
			state.shouldCaptureVisibleCommand = false;
			continue;
		}

		if (char === "\x7f" || char === "\b") {
			state.line = state.line.slice(0, -1);
			continue;
		}

		if (char === "\t") {
			state.line += char;
			continue;
		}

		if (char === "\x1b") {
			const escapeSequence = readEscapeSequence(data, i);
			if (isVisibleCommandEditingSequence(escapeSequence.sequence)) {
				state.shouldCaptureVisibleCommand = true;
			}
			i = escapeSequence.endIndex;
			continue;
		}

		if (char >= " ") {
			state.line += char;
		}
	}

	return {
		commands,
		clearHistory,
		...(captureCurrentLine && { captureCurrentLine }),
	};
}

export function isBufferClearingCommand(command: string): boolean {
	const trimmed = command.trim().toLowerCase();
	if (!trimmed) return false;

	return trimmed
		.split(/&&|;|\|\|/)
		.some((commandSegment) =>
			isStandaloneBufferClearingCommand(commandSegment.trim()),
		);
}

function isStandaloneBufferClearingCommand(command: string): boolean {
	return (
		command === "clear" ||
		command === "reset" ||
		command === "cls" ||
		command === "tput clear"
	);
}

function readEscapeSequence(
	data: string,
	start: number,
): { sequence: string; endIndex: number } {
	let index = start + 1;
	if (data[index] === "[") {
		index++;
		while (index < data.length && !isCsiFinalByte(data.charCodeAt(index))) {
			index++;
		}
		const endIndex = Math.min(index, data.length - 1);
		return { sequence: data.slice(start, endIndex + 1), endIndex };
	}

	if (data[index] === "]") {
		index++;
		while (index < data.length) {
			if (data[index] === "\x07") {
				return { sequence: data.slice(start, index + 1), endIndex: index };
			}
			if (data[index] === "\x1b" && data[index + 1] === "\\") {
				const endIndex = Math.min(index + 1, data.length - 1);
				return { sequence: data.slice(start, endIndex + 1), endIndex };
			}
			index++;
		}
		return { sequence: data.slice(start), endIndex: data.length - 1 };
	}

	const endIndex = Math.min(index, data.length - 1);
	return { sequence: data.slice(start, endIndex + 1), endIndex };
}

function isCsiFinalByte(code: number): boolean {
	return code >= 0x40 && code <= 0x7e;
}

function isVisibleCommandEditingSequence(sequence: string): boolean {
	return (
		/^\x1b\[(?:\d+;)*[A-DHF]$/.test(sequence) ||
		/^\x1bO[A-DHF]$/.test(sequence) ||
		/^\x1b\[(?:1|3|4|7|8)(?:;\d+)?~$/.test(sequence)
	);
}
