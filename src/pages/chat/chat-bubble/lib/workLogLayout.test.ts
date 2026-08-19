import type { AcpMessagePart } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import type { ToolCallPart } from "./messageParts";
import {
	countByKind,
	foldPathRuns,
	mergeSameFileRuns,
	splitCommentary,
	windowRows,
} from "./workLogLayout";

function read(path: string): ToolCallPart {
	return {
		type: "tool_call",
		name: "read",
		status: "completed",
		locations: [{ path }],
	} as ToolCallPart;
}

function run(description: string, status = "completed"): ToolCallPart {
	return {
		type: "tool_call",
		name: "execute",
		status,
		arguments: JSON.stringify({ command: "true", description }),
	} as ToolCallPart;
}

describe("mergeSameFileRuns", () => {
	it("collapses consecutive edits to the same file into the last one", () => {
		// Devin ships exactly this rule: "Consecutive file edits to the same file
		// are now merged into a single entry". Ten `Changed foo.ts` rows carry no
		// distinguishing information at all, unlike a run of commands.
		const first = {
			...read("a/one.md"),
			name: "edit",
			id: "e1",
		} as ToolCallPart;
		const second = {
			...read("a/one.md"),
			name: "edit",
			id: "e2",
		} as ToolCallPart;
		const merged = mergeSameFileRuns([first, second]);
		expect(merged).toHaveLength(1);
		expect((merged[0] as ToolCallPart).id).toBe("e2");
	});

	it("leaves edits to different files alone", () => {
		const a = { ...read("a/one.md"), name: "edit", id: "e1" } as ToolCallPart;
		const b = { ...read("a/two.md"), name: "edit", id: "e2" } as ToolCallPart;
		expect(mergeSameFileRuns([a, b])).toHaveLength(2);
	});

	it("does not merge across an interleaved part", () => {
		const a = { ...read("a/one.md"), name: "edit", id: "e1" } as ToolCallPart;
		const b = { ...read("a/one.md"), name: "edit", id: "e2" } as ToolCallPart;
		const text: AcpMessagePart = { type: "text", text: "Checking." };
		expect(mergeSameFileRuns([a, text, b])).toHaveLength(3);
	});
});

describe("foldPathRuns", () => {
	it("folds three or more consecutive reads", () => {
		const rows = foldPathRuns([
			read("a/b/one.md"),
			read("a/b/two.md"),
			read("a/b/three.md"),
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ kind: "folded", verb: "Read 3 files" });
	});

	it("leaves a run of two alone", () => {
		const rows = foldPathRuns([read("a/one.md"), read("a/two.md")]);
		expect(rows.every((row) => row.kind === "part")).toBe(true);
	});

	it("never folds command runs, because each carries its own sentence", () => {
		const rows = foldPathRuns([
			run("Check branch state"),
			run("List ADRs"),
			run("Read README"),
		]);
		expect(rows).toHaveLength(3);
		expect(rows.every((row) => row.kind === "part")).toBe(true);
	});

	it("drops the shared directory when the paths do not share one", () => {
		const rows = foldPathRuns([
			read("a/one.md"),
			read("b/two.md"),
			read("c/three.md"),
		]);
		expect(rows[0]).toMatchObject({ kind: "folded", directory: undefined });
	});
});

describe("windowRows", () => {
	it("keeps everything when the run fits", () => {
		const rows = [read("a.md"), read("b.md")].map(
			(part) => ({ kind: "part", part }) as const,
		);
		expect(windowRows(rows, 6)).toEqual({ hidden: 0, rows });
	});

	it("keeps the newest rows and reports how many are hidden", () => {
		const rows = Array.from(
			{ length: 10 },
			(_, index) => ({ kind: "part", part: read(`${index}.md`) }) as const,
		);
		const layout = windowRows(rows, 6);
		expect(layout.hidden).toBe(4);
		expect(layout.rows).toHaveLength(6);
		expect(layout.rows[0]).toBe(rows[4]);
	});
});

describe("splitCommentary", () => {
	it("promotes the last text part and leaves the earlier ones in place", () => {
		const parts: AcpMessagePart[] = [
			{ type: "text", text: "First thought." },
			read("a.md"),
			{ type: "text", text: "Second thought." },
		];
		const split = splitCommentary(parts);
		expect(split.commentary).toBe("Second thought.");
		expect(split.rest).toHaveLength(2);
		expect(split.rest[0]).toEqual({ type: "text", text: "First thought." });
	});

	it("prefers reasoning over commentary when an agent sends it", () => {
		const parts: AcpMessagePart[] = [
			{ type: "text", text: "Commentary." },
			{ type: "reasoning", content: "Because the fixture seeds a price." },
		];
		expect(splitCommentary(parts).commentary).toBe(
			"Because the fixture seeds a price.",
		);
	});

	it("returns no commentary when there is no text part", () => {
		expect(splitCommentary([read("a.md")]).commentary).toBeUndefined();
	});
});

describe("countByKind", () => {
	it("counts work parts by the kind the rows use", () => {
		expect(countByKind([read("a.md"), read("b.md"), run("x")]).counts).toEqual([
			{ kind: "read", count: 2 },
			{ kind: "execute", count: 1 },
		]);
	});

	it("counts failures separately, because that is what changes the next move", () => {
		expect(countByKind([run("x"), run("y", "failed")]).failed).toBe(1);
	});
});
