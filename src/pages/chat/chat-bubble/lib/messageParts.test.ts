import type { AcpMessagePart } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import { messagePartsToMarkdown, readPlanEntries } from "./messageParts";

type PlanPart = Extract<AcpMessagePart, { type: "plan" }>;

function planPart(part: Record<string, unknown>): PlanPart {
	return { type: "plan", content: "", ...part } as PlanPart;
}

describe("readPlanEntries", () => {
	it("reads entries carried on the wire despite the pinned protocol types", () => {
		const entries = readPlanEntries(
			planPart({
				entries: [
					{ content: "Read the schema", status: "completed" },
					{ content: "Fix the view", status: "in_progress" },
				],
			}),
		);
		expect(entries).toHaveLength(2);
		expect(entries[1]).toEqual({
			content: "Fix the view",
			status: "in_progress",
		});
	});

	it("returns an empty list when entries are absent", () => {
		expect(readPlanEntries(planPart({ content: "some plan" }))).toEqual([]);
	});

	it("drops malformed entries rather than rendering a broken checklist", () => {
		const entries = readPlanEntries(
			planPart({
				entries: [{ content: "Valid" }, null, 42, { status: "pending" }],
			}),
		);
		expect(entries).toEqual([{ content: "Valid" }]);
	});

	it("ignores a non-array entries value", () => {
		expect(readPlanEntries(planPart({ entries: "nope" }))).toEqual([]);
	});
});

describe("plan markdown", () => {
	it("copies a plan as a markdown task list", () => {
		const markdown = messagePartsToMarkdown([
			planPart({
				entries: [
					{ content: "Done thing", status: "completed" },
					{ content: "Current thing", status: "in_progress" },
					{ content: "Later thing", status: "pending" },
				],
			}),
		]);
		expect(markdown).toBe(
			"- [x] Done thing\n- [ ] Current thing _(in progress)_\n- [ ] Later thing",
		);
	});

	it("falls back to flat text when no entries are present", () => {
		const markdown = messagePartsToMarkdown([
			planPart({ content: "pending: legacy plan text" }),
		]);
		expect(markdown).toBe("pending: legacy plan text");
	});
});
