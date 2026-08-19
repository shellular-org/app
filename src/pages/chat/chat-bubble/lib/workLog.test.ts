import type { AcpMessage, AcpMessagePart } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import type { ToolCallPart } from "./messageParts";
import {
	coalesceToolCalls,
	formatWorkDuration,
	getElapsedDurationMs,
	groupWorkLogParts,
	projectAssistantTurn,
} from "./workLog";

function message(parts: AcpMessagePart[]): AcpMessage {
	return { role: "assistant", parts };
}

function tool(part: Partial<ToolCallPart>): ToolCallPart {
	return {
		type: "tool_call",
		name: "tool",
		...part,
	} as ToolCallPart;
}

describe("projectAssistantTurn", () => {
	it("keeps the terminal answer visible and moves earlier commentary into work", () => {
		const projection = projectAssistantTurn([
			message([{ type: "text", text: "I will inspect it." }]),
			message([tool({ id: "read-1", name: "read", status: "completed" })]),
			message([{ type: "text", text: "The fix is complete." }]),
		]);

		expect(projection.workParts.map((part) => part.type)).toEqual([
			"text",
			"tool_call",
		]);
		expect(projection.answerParts).toEqual([
			{ type: "text", text: "The fix is complete." },
		]);
	});

	it("leaves an ordinary assistant response untouched", () => {
		const parts: AcpMessagePart[] = [{ type: "text", text: "Hello" }];
		expect(projectAssistantTurn([message(parts)])).toEqual({
			answerParts: parts,
			workParts: [],
		});
	});

	it("keeps trailing prose in the live work log until the turn settles", () => {
		const projection = projectAssistantTurn(
			[
				message([tool({ id: "read-1", name: "read", status: "completed" })]),
				message([{ type: "text", text: "I found the relevant component." }]),
			],
			true,
		);

		expect(projection.answerParts).toEqual([]);
		expect(projection.workParts.map((part) => part.type)).toEqual([
			"tool_call",
			"text",
		]);
	});
});

describe("coalesceToolCalls", () => {
	it("patches repeated tool ids into one stable row", () => {
		const result = coalesceToolCalls([
			tool({ id: "tool-1", name: "read", title: "Reading", status: "pending" }),
			{ type: "reasoning", content: "checking" },
			tool({ id: "tool-1", name: "read", status: "completed", output: "done" }),
		]);

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			id: "tool-1",
			title: "Reading",
			status: "completed",
			output: "done",
		});
	});
});

describe("groupWorkLogParts", () => {
	it("ends an action burst at commentary or reasoning", () => {
		const groups = groupWorkLogParts([
			tool({ id: "one" }),
			tool({ id: "two" }),
			{ type: "text", text: "I found the renderer." },
			{ type: "reasoning", content: "Checking the state model." },
			tool({ id: "three" }),
			tool({ id: "four" }),
		]);

		expect(
			groups.map((group) =>
				group.kind === "actions"
					? [group.kind, group.parts.length]
					: [group.kind, group.part.type],
			),
		).toEqual([
			["actions", 2],
			["content", "text"],
			["content", "reasoning"],
			["actions", 2],
		]);
	});
});

describe("formatWorkDuration", () => {
	it("formats short and minute-scale turns", () => {
		expect(formatWorkDuration(8_250)).toBe("8.3s");
		expect(formatWorkDuration(72_000)).toBe("1m 12s");
		expect(formatWorkDuration(119_800)).toBe("2m");
	});

	it("measures protocol seconds or milliseconds with the same clock", () => {
		expect(getElapsedDurationMs(1_000, 1_008.25)).toBe(8_250);
		expect(getElapsedDurationMs(1_000_000_000_000, 1_000_000_008_250)).toBe(
			8_250,
		);
	});
});
