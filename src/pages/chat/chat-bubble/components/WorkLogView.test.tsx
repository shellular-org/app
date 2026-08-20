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

function command(
	id: string,
	description: string,
	status = "completed",
): Extract<AcpMessagePart, { type: "tool_call" }> {
	return {
		type: "tool_call",
		id,
		name: "execute",
		status,
		title: description,
		arguments: JSON.stringify({ command: "true", description }),
	} as ToolCallPart;
}

describe("WorkLogView", () => {
	it("shows every step of a burst, not only the latest one", () => {
		render(
			<WorkLogView
				parts={[
					command("one", "Check branch state"),
					command("two", "List the ADRs"),
					command("three", "Read the README"),
				]}
				streaming
				stateKey="live-turn"
			/>,
		);

		expect(screen.getByText("Check branch state")).toBeTruthy();
		expect(screen.getByText("List the ADRs")).toBeTruthy();
		expect(screen.getByText("Read the README")).toBeTruthy();
		expect(screen.queryByText(/previous tool call/)).toBeNull();
	});

	it("keeps consecutive actions in independent bursts around commentary", () => {
		render(
			<WorkLogView
				parts={[
					{ type: "text", text: "I’ll inspect the message pipeline." },
					command("one", "Check branch state"),
					{ type: "text", text: "I found the renderer." },
					command("two", "Read the README"),
				]}
				streaming
				stateKey="bursts"
			/>,
		);

		expect(screen.getByText("I’ll inspect the message pipeline.")).toBeTruthy();
		expect(screen.getByText("I found the renderer.")).toBeTruthy();
		expect(screen.getByText("Check branch state")).toBeTruthy();
		expect(screen.getByText("Read the README")).toBeTruthy();
	});
});

describe("work log windowing", () => {
	it("shows the newest rows and hides the rest behind one control", () => {
		const parts = Array.from({ length: 10 }, (_, index) =>
			command(`t-${index}`, `Step ${index}`),
		);
		render(<WorkLogView parts={parts} streaming stateKey="w" />);
		expect(screen.getByText("4 earlier steps")).toBeInTheDocument();
		expect(screen.getByText("Step 9")).toBeInTheDocument();
		expect(screen.queryByText("Step 0")).toBeNull();
		expect(screen.queryByText(/previous tool calls/)).toBeNull();
	});

	it("expands the hidden rows when the control is pressed", () => {
		const parts = Array.from({ length: 10 }, (_, index) =>
			command(`t-${index}`, `Step ${index}`),
		);
		render(<WorkLogView parts={parts} streaming stateKey="w" />);
		fireEvent.click(screen.getByText("4 earlier steps"));
		expect(screen.queryByText("4 earlier steps")).toBeNull();
		expect(screen.getByText("Step 0")).toBeInTheDocument();
	});
});

describe("work log folding", () => {
	it("folds a run of file reads into one row with basename chips", () => {
		render(
			<WorkLogView
				parts={[
					tool("one", "read", "src/lib/one.ts"),
					tool("two", "read", "src/lib/two.ts"),
					tool("three", "read", "src/lib/three.ts"),
				]}
				streaming
				stateKey="fold"
			/>,
		);
		expect(screen.getByText("Read 3 files")).toBeInTheDocument();
		expect(screen.getByText("one.ts")).toBeInTheDocument();
		expect(screen.getByText("three.ts")).toBeInTheDocument();
	});

	it("never folds a run of commands, because each carries its own sentence", () => {
		render(
			<WorkLogView
				parts={[
					command("one", "Check branch state"),
					command("two", "List the ADRs"),
					command("three", "Read the README"),
				]}
				streaming
				stateKey="no-fold"
			/>,
		);
		expect(screen.queryByText(/Ran 3/)).toBeNull();
		expect(screen.getByText("Check branch state")).toBeInTheDocument();
	});
});

describe("settled work log", () => {
	it("folds a settled turn behind its duration", () => {
		render(
			<WorkLogView
				parts={[command("one", "Check branch state")]}
				streaming={false}
				stateKey="settled-turn"
				durationMs={8_250}
			/>,
		);

		const summary = screen.getByRole("button", { name: /Worked 8\.3s/ });
		expect(summary.getAttribute("aria-expanded")).toBe("false");
		const panel = summary.parentElement?.querySelector(
			".chat-disclosure-panel",
		);
		expect(panel?.getAttribute("aria-hidden")).toBe("true");
		fireEvent.click(summary);
		expect(panel?.getAttribute("aria-hidden")).toBe("false");
		expect(screen.getByText("Check branch state")).toBeTruthy();
	});

	it("summarises a settled turn by kind, not by duration alone", () => {
		render(
			<WorkLogView
				parts={[
					tool("r1", "read", "a.md"),
					tool("r2", "read", "b.md"),
					command("e1", "Run it"),
				]}
				streaming={false}
				stateKey="settled"
				durationMs={72_000}
			/>,
		);
		expect(screen.getByText(/Worked 1m 12s/)).toBeInTheDocument();
		expect(screen.getByText(/2 read/)).toBeInTheDocument();
		expect(screen.getByText(/1 ran/)).toBeInTheDocument();
	});

	it("surfaces the failure count in the collapsed header", () => {
		render(
			<WorkLogView
				parts={[command("f1", "Run the tests", "failed")]}
				streaming={false}
				stateKey="failed"
				durationMs={1_000}
			/>,
		);
		expect(screen.getByText(/1 failed/)).toBeInTheDocument();
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

		fireEvent.click(screen.getByRole("button", { name: /Worked 2\.0s/ }));
		expect(screen.getByText("src/chat.tsx")).toBeTruthy();
	});
});
