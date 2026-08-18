import type { AcpMessagePart } from "@shellular/protocol";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolCallPart } from "../lib/messageParts";
import WorkLogView from "./WorkLogView";

// Keep this component test focused on work-log projection and disclosure. The
// full message renderer pulls in terminal runtime modules that are unrelated to
// this interaction and are intentionally absent from the lightweight test env.
vi.mock("./MessagePartView", () => ({
	default: ({ part }: { part: AcpMessagePart }) => {
		if (part.type === "tool_call") {
			return <div>{part.locations?.[0]?.path ?? part.title ?? part.name}</div>;
		}
		return <div>{part.type}</div>;
	},
}));

vi.mock("./ToolCallContentView", () => ({
	default: ({ part }: { part: ToolCallPart }) => (
		<div>{part.locations?.[0]?.path ?? part.title ?? part.name}</div>
	),
}));

afterEach(cleanup);

function tool(
	id: string,
	name: string,
	path: string,
): Extract<AcpMessagePart, { type: "tool_call" }> {
	return {
		type: "tool_call",
		id,
		name,
		status: "completed",
		locations: [{ path }],
	} as ToolCallPart;
}

describe("WorkLogView", () => {
	it("groups only consecutive live tool calls into independent bursts", () => {
		render(
			<WorkLogView
				parts={[
					{ type: "text", text: "I’ll inspect the message pipeline." },
					tool("one", "read", "src/one.ts"),
					tool("two", "read", "src/two.ts"),
					tool("three", "read", "src/three.ts"),
					{ type: "text", text: "I found the renderer." },
					tool("four", "read", "src/four.ts"),
					tool("five", "read", "src/five.ts"),
				]}
				streaming
				stateKey="live-turn"
				startedAt={Date.now() - 13_000}
			/>,
		);

		expect(screen.getByText("I’ll inspect the message pipeline.")).toBeTruthy();
		expect(screen.getByText(/src\/three\.ts/)).toBeTruthy();
		expect(screen.getByText("I found the renderer.")).toBeTruthy();
		expect(screen.getByText(/src\/five\.ts/)).toBeTruthy();
		expect(screen.queryByText(/src\/one\.ts/)).toBeNull();
		expect(screen.queryByText(/src\/four\.ts/)).toBeNull();
		const firstBurst = screen.getByRole("button", {
			name: "+2 previous tool calls",
		});
		expect(
			screen.getByRole("button", { name: "+1 previous tool call" }),
		).toBeTruthy();
		fireEvent.click(firstBurst);
		const oldestTool = screen.getByText(/src\/one\.ts/);
		const showFewer = screen.getByRole("button", {
			name: "Show fewer tool calls",
		});
		expect(
			oldestTool.compareDocumentPosition(showFewer) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Hide previous tool calls" }),
		).toBeNull();
		// Revealing one burst must not flatten or reveal the later burst.
		expect(screen.queryByText(/src\/four\.ts/)).toBeNull();
	});

	it("preserves per-burst grouping inside the settled duration fold", () => {
		render(
			<WorkLogView
				parts={[
					tool("one", "read", "src/one.ts"),
					tool("two", "read", "src/two.ts"),
					{ type: "text", text: "Now I’ll verify it." },
					tool("three", "read", "src/three.ts"),
					tool("four", "read", "src/four.ts"),
				]}
				streaming={false}
				stateKey="settled-turn"
				durationMs={8_250}
			/>,
		);

		const summary = screen.getByRole("button", {
			name: /Worked for 8\.3s/,
		});
		expect(summary.getAttribute("aria-expanded")).toBe("false");
		const panel = summary.parentElement?.querySelector(
			".chat-disclosure-panel",
		);
		expect(panel?.getAttribute("aria-hidden")).toBe("true");
		fireEvent.click(summary);
		expect(panel?.getAttribute("aria-hidden")).toBe("false");
		expect(screen.getByText(/src\/two\.ts/)).toBeTruthy();
		expect(screen.getByText(/src\/four\.ts/)).toBeTruthy();
		expect(screen.queryByText(/src\/one\.ts/)).toBeNull();
		const burstToggles = screen.getAllByRole("button", {
			name: "+1 previous tool call",
		});
		expect(burstToggles).toHaveLength(2);
		fireEvent.click(burstToggles[0]);
		expect(screen.getByText(/src\/one\.ts/)).toBeTruthy();
		expect(screen.queryByText(/src\/three\.ts/)).toBeNull();
		expect(summary.textContent).not.toContain("tool call");
	});

	it("keeps file-change activities available in the expanded work log", () => {
		render(
			<WorkLogView
				parts={[
					{
						type: "file_change",
						id: "edit-one",
						path: "src/chat.tsx",
						kind: "update",
						status: "completed",
						diff: { old: "old", new: "new" },
					},
				]}
				streaming={false}
				stateKey="file-change-turn"
				durationMs={2_000}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Worked for 2\.0s/ }));
		expect(screen.getByText("src/chat.tsx")).toBeTruthy();
	});
});
