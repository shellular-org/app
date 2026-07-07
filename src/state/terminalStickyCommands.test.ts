import { describe, expect, it } from "vitest";
import {
	applyTerminalInputToCommandState,
	createTerminalCommandInputState,
	isBufferClearingCommand,
} from "./terminalStickyCommands";

describe("terminal sticky command input tracking", () => {
	it("records a normal command on enter", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(state, "ifconfig\r");

		expect(result).toEqual({ commands: ["ifconfig"], clearHistory: false });
		expect(state.line).toBe("");
	});

	it("keeps long command text for wrapped command rows", () => {
		const state = createTerminalCommandInputState();
		const command =
			"node -e \"console.log('this command is intentionally long enough to wrap in a narrow terminal')\"";

		const result = applyTerminalInputToCommandState(state, `${command}\r`);

		expect(result.commands).toEqual([command]);
	});

	it("records pasted commands split by newlines", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(
			state,
			"echo one\necho two\r",
		);

		expect(result).toEqual({
			commands: ["echo one", "echo two"],
			clearHistory: false,
		});
	});

	it("applies backspace edits before enter", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(
			state,
			"pingg\x7f example.com\r",
		);

		expect(result.commands).toEqual(["ping example.com"]);
	});

	it("ignores empty enters", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(state, "\r\n");

		expect(result).toEqual({ commands: [], clearHistory: false });
	});

	it("clears the in-progress line on ctrl+c", () => {
		const state = createTerminalCommandInputState();

		applyTerminalInputToCommandState(state, "ping example.com\x03");
		const result = applyTerminalInputToCommandState(state, "\r");

		expect(result.commands).toEqual([]);
		expect(state.line).toBe("");
	});

	it("clears the in-progress line on readline undo", () => {
		const state = createTerminalCommandInputState();

		applyTerminalInputToCommandState(state, "echo hello\x1f");
		const result = applyTerminalInputToCommandState(state, "\r");

		expect(result.commands).toEqual([]);
		expect(state.line).toBe("");
	});

	it("flags ctrl+l as buffer-clearing and clears in-progress input", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(state, "echo hello\x0c");

		expect(result).toEqual({ commands: [], clearHistory: true });
		expect(state.line).toBe("");
		expect(state.shouldCaptureVisibleCommand).toBe(false);
	});

	it("flags clear and reset commands as buffer-clearing", () => {
		const state = createTerminalCommandInputState();

		const clearResult = applyTerminalInputToCommandState(
			state,
			"clear && echo hi\r",
		);
		const resetResult = applyTerminalInputToCommandState(state, "reset\r");

		expect(clearResult).toEqual({ commands: [], clearHistory: true });
		expect(resetResult).toEqual({ commands: [], clearHistory: true });
		expect(isBufferClearingCommand("tput clear")).toBe(true);
		expect(isBufferClearingCommand("echo hi && clear")).toBe(true);
		expect(isBufferClearingCommand("echo hi; reset")).toBe(true);
		expect(isBufferClearingCommand("echo clear")).toBe(false);
	});

	it("discards commands entered before a clear in the same paste", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(
			state,
			"echo before\nclear\necho after\r",
		);

		expect(result).toEqual({
			commands: ["echo after"],
			clearHistory: true,
		});
	});

	it("discards commands entered before ctrl+l in the same input sequence", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(
			state,
			"echo before\r\x0cecho after\r",
		);

		expect(result).toEqual({
			commands: ["echo after"],
			clearHistory: true,
		});
	});

	it("asks the terminal buffer for history-recalled commands", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(state, "\x1b[A\r");

		expect(result).toEqual({
			commands: [],
			clearHistory: false,
			captureCurrentLine: true,
		});
	});

	it("does not capture a visible command after ctrl+l clears history recall", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(state, "\x1b[A\x0c\r");

		expect(result).toEqual({ commands: [], clearHistory: true });
		expect(state.shouldCaptureVisibleCommand).toBe(false);
	});

	it("asks the terminal buffer when cursor editing makes typed text unreliable", () => {
		const state = createTerminalCommandInputState();

		const result = applyTerminalInputToCommandState(state, "ech\x1b[Do\r");

		expect(result).toEqual({
			commands: [],
			clearHistory: false,
			captureCurrentLine: true,
		});
	});
});
