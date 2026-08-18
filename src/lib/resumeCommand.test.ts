import { describe, expect, it } from "vitest";
import { getResumeCommand } from "./resumeCommand";

describe("getResumeCommand", () => {
	it("uses a PowerShell-compatible separator on Windows", () => {
		expect(getResumeCommand("codex", "session-1", "C:\\work", "win32")).toBe(
			"cd C:\\work; codex resume session-1",
		);
	});

	it("uses the Unix shell separator on non-Windows hosts", () => {
		expect(
			getResumeCommand("claude-code", "session-1", "/work", "darwin"),
		).toBe("cd /work && claude --resume session-1");
	});
});
