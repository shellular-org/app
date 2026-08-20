import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatBubble from "./index";

vi.mock("./components/WorkLogView", () => ({
	default: () => <div>work log</div>,
}));
vi.mock("./components/MessagePartView", () => ({
	default: () => <div>part</div>,
}));

afterEach(cleanup);

describe("ChatBubble", () => {
	it("promotes the latest commentary into the turn header while streaming", () => {
		render(
			<ChatBubble
				messageKey="m1"
				messageRole="assistant"
				assistantName="Claude Code"
				parts={[]}
				workParts={[
					{ type: "text", text: "Loading the plan." },
					{ type: "text", text: "Checking the branch." },
				]}
				streaming
			/>,
		);
		expect(screen.getByText("Claude Code is working")).toBeInTheDocument();
		expect(screen.getByText("Checking the branch.")).toBeInTheDocument();
	});

	it("shows the turn header before the first tool call arrives", () => {
		// The old typing line was the only thing here, and it is the line that
		// pasted a raw shell command into a sentence.
		render(
			<ChatBubble
				messageKey="m2"
				messageRole="assistant"
				assistantName="Claude Code"
				parts={[]}
				workParts={[]}
				streaming
			/>,
		);
		expect(screen.getByText("Claude Code is working")).toBeInTheDocument();
		expect(screen.queryByText(/is cd "/)).toBeNull();
		expect(screen.queryByText(/is thinking/)).toBeNull();
	});

	it("names the state it is blocked on", () => {
		render(
			<ChatBubble
				messageKey="m3"
				messageRole="assistant"
				assistantName="Claude Code"
				parts={[]}
				workParts={[]}
				turnState="waiting-permission"
				streaming
			/>,
		);
		expect(
			screen.getByText("Claude Code is waiting for permission"),
		).toBeInTheDocument();
	});

	it("renders no turn header once the turn has settled", () => {
		const { container } = render(
			<ChatBubble
				messageKey="m4"
				messageRole="assistant"
				assistantName="Claude Code"
				parts={[{ type: "text", text: "Done." }]}
				workParts={[]}
				streaming={false}
			/>,
		);
		expect(container.querySelector(".turn-header")).toBeNull();
	});
});
