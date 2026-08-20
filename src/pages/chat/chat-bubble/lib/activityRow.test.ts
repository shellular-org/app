import { describe, expect, it } from "vitest";
import { deriveActivityRow } from "./activityRow";
import type { ToolCallPart } from "./messageParts";

function tool(part: Partial<ToolCallPart>): ToolCallPart {
	return { type: "tool_call", name: "tool", ...part } as ToolCallPart;
}

describe("deriveActivityRow", () => {
	it("prefers the input description over the raw command", () => {
		const row = deriveActivityRow(
			tool({
				name: "execute",
				title: 'cd "/home/jk/devowl-wp" && git log --oneline -3',
				arguments: JSON.stringify({
					command: 'cd "/home/jk/devowl-wp" && git log --oneline -3',
					description: "Check branch state",
				}),
				status: "completed",
			}),
		);
		expect(row).toMatchObject({
			kind: "execute",
			verb: "Ran",
			object: "Check branch state",
			objectIsMono: false,
		});
	});

	it("falls back to the first line of the command when there is no description", () => {
		const row = deriveActivityRow(
			tool({
				name: "execute",
				arguments: JSON.stringify({ command: "pnpm test\npnpm typecheck" }),
				status: "completed",
			}),
		);
		expect(row.object).toBe("pnpm test");
		expect(row.objectIsMono).toBe(true);
	});

	it("keeps the basename for a read", () => {
		const row = deriveActivityRow(
			tool({
				name: "read",
				locations: [
					{ path: "backends/real-commerce/.ai/concepts/adrs/04-tax-basis.md" },
				],
				status: "completed",
			}),
		);
		expect(row.verb).toBe("Read");
		expect(row.object).toContain("04-tax-basis.md");
		expect(row.objectIsMono).toBe(true);
	});

	it("reads the path from the arguments when locations are absent", () => {
		// Measured: locations is set on only 16 of 182 calls.
		const row = deriveActivityRow(
			tool({
				name: "read",
				arguments: JSON.stringify({ file_path: "src/state/acp.ts" }),
				status: "completed",
			}),
		);
		expect(row.object).toBe("src/state/acp.ts");
	});

	it("lets the title lead for the other kind and names the MCP server", () => {
		const row = deriveActivityRow(
			tool({
				name: "other",
				title: "mcp__owly__playwright__browser_take_screenshot",
				status: "completed",
			}),
		);
		expect(row.verb).toBe("Owly");
		expect(row.object).toBe("[playwright__browser_take_screenshot]");
	});

	it("handles an MCP tool with no nested prefix", () => {
		const row = deriveActivityRow(
			tool({ name: "other", title: "mcp__clickup__get_task" }),
		);
		expect(row.verb).toBe("Clickup");
		expect(row.object).toBe("[get_task]");
	});

	it("prefers the Claude Code description, and does not assume it elsewhere", () => {
		const args = JSON.stringify({
			description: "Check branch state",
			command: "git status",
		});
		expect(
			deriveActivityRow(
				tool({ name: "execute", arguments: args }),
				"claude-code",
			).object,
		).toBe("Check branch state");
		// An agent we know nothing about must not inherit another agent's convention.
		expect(
			deriveActivityRow(tool({ name: "execute", arguments: args }), "gemini")
				.object,
		).toBe("git status");
	});

	it("leaves a non-MCP other title alone", () => {
		const row = deriveActivityRow(
			tool({ name: "other", title: "Load skill: superpowers:writing-plans" }),
		);
		expect(row.object).toBe("Load skill: superpowers:writing-plans");
	});

	it("uses the present tense while the call is running", () => {
		const row = deriveActivityRow(
			tool({ name: "read", status: "in_progress" }),
		);
		expect(row.verb).toBe("Reading");
		expect(row.running).toBe(true);
	});

	it("flags a failure", () => {
		const row = deriveActivityRow(tool({ name: "execute", status: "failed" }));
		expect(row.failed).toBe(true);
		expect(row.verb).toBe("Ran");
	});

	it("keeps the unelided value for the accessible name", () => {
		const path =
			"backends/real-commerce/.ai/concepts/2026-07-04 Contract-Price/adrs/04.md";
		const row = deriveActivityRow(
			tool({ name: "read", locations: [{ path }], status: "completed" }),
		);
		expect(row.objectFull).toBe(path);
		expect(row.object).not.toBe(path);
	});

	it("never exposes raw argument JSON as the object", () => {
		const row = deriveActivityRow(
			tool({ name: "execute", title: '{"command":"pnpm test"}' }),
		);
		expect(row.object ?? "").not.toContain("{");
	});

	// Ported from the deriveToolActivityPresentation cases this replaces, so the
	// swap is provably not a regression.
	it("extracts a command instead of exposing raw argument JSON", () => {
		const row = deriveActivityRow(
			tool({
				name: "exec_command",
				title: '{"command":"pnpm test"}',
				arguments: JSON.stringify({ command: "pnpm test" }),
			}),
		);
		expect(row).toMatchObject({
			kind: "execute",
			verb: "Ran",
			object: "pnpm test",
		});
	});

	it("prefers the ACP location for file activity", () => {
		const row = deriveActivityRow(
			tool({ name: "read", locations: [{ path: "src/chat.tsx", line: 12 }] }),
		);
		expect(row).toMatchObject({
			kind: "read",
			verb: "Read",
			object: "src/chat.tsx",
		});
	});
});
