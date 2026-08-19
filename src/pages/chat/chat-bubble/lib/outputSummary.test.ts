import { describe, expect, it } from "vitest";
import { summarizeToolOutput } from "./outputSummary";

describe("summarizeToolOutput", () => {
	it("returns null for empty output", () => {
		expect(summarizeToolOutput(undefined)).toBeNull();
		expect(summarizeToolOutput("   \n  ")).toBeNull();
	});

	it("renders one line inline", () => {
		expect(summarizeToolOutput("7 entries")).toEqual({
			mode: "inline",
			lines: ["7 entries"],
			lineCount: 1,
			needsFullView: false,
		});
	});

	it("renders two lines inline", () => {
		const summary = summarizeToolOutput("first\nsecond");
		expect(summary?.mode).toBe("inline");
		expect(summary?.lines).toEqual(["first", "second"]);
	});

	it("switches to a peek at three lines and caps it", () => {
		const summary = summarizeToolOutput("a\nb\nc\nd\ne");
		expect(summary?.mode).toBe("peek");
		expect(summary?.lines).toEqual(["a", "b", "c"]);
		expect(summary?.lineCount).toBe(5);
	});

	it("always uses a peek for a failure, even for one line", () => {
		expect(summarizeToolOutput("boom", { failed: true })?.mode).toBe("peek");
	});

	it("keeps the LAST lines while running, because the newest output is the point", () => {
		// Cursor CLI: "Long shell output truncates from the top. You see the
		// latest output of a streaming command, not the oldest."
		const summary = summarizeToolOutput("a\nb\nc\nd\ne", { running: true });
		expect(summary?.lines).toEqual(["c", "d", "e"]);
		expect(summary?.clipped).toBe("top");
	});

	it("keeps the LAST lines on failure, because the error is at the end", () => {
		expect(summarizeToolOutput("a\nb\nc\nd", { failed: true })?.lines).toEqual([
			"b",
			"c",
			"d",
		]);
	});

	it("keeps the FIRST lines for a completed call", () => {
		const summary = summarizeToolOutput("a\nb\nc\nd\ne");
		expect(summary?.lines).toEqual(["a", "b", "c"]);
		expect(summary?.clipped).toBe("bottom");
	});

	it("flags output over 250 characters for a full view", () => {
		expect(summarizeToolOutput("x".repeat(251))?.needsFullView).toBe(true);
		expect(summarizeToolOutput("x".repeat(120))?.needsFullView).toBe(false);
	});

	it("strips ANSI before counting", () => {
		const summary = summarizeToolOutput("\u001b[32mok\u001b[0m");
		expect(summary?.lines).toEqual(["ok"]);
		expect(summary?.mode).toBe("inline");
	});

	it("ignores leading and trailing blank lines", () => {
		expect(summarizeToolOutput("\n\nonly\n\n\n")?.lineCount).toBe(1);
	});
});
