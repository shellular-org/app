import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ActivityRowModel } from "../lib/activityRow";
import ActivityRow from "./ActivityRow";

afterEach(cleanup);

const RAN: ActivityRowModel = {
	kind: "execute",
	verb: "Ran",
	object: "Check branch state",
	objectIsMono: false,
	running: false,
	failed: false,
};

describe("ActivityRow", () => {
	it("renders the verb and the object", () => {
		render(<ActivityRow row={RAN} />);
		expect(screen.getByText("Ran")).toBeInTheDocument();
		expect(screen.getByText("Check branch state")).toBeInTheDocument();
	});

	it("renders one line of output inline, without a peek block", () => {
		const { container } = render(
			<ActivityRow
				row={RAN}
				output={{
					mode: "inline",
					lines: ["7 entries"],
					lineCount: 1,
					needsFullView: false,
				}}
			/>,
		);
		expect(screen.getByText("7 entries")).toBeInTheDocument();
		expect(container.querySelector(".activity-row-peek")).toBeNull();
	});

	it("renders a peek block with the line count for longer output", () => {
		const { container } = render(
			<ActivityRow
				row={RAN}
				output={{
					mode: "peek",
					lines: ["a", "b", "c"],
					lineCount: 12,
					needsFullView: true,
					clipped: "bottom",
				}}
			/>,
		);
		expect(container.querySelector(".activity-row-peek")).not.toBeNull();
		expect(screen.getByText("12 lines")).toBeInTheDocument();
	});

	it("keeps the result visible without expanding the row", () => {
		// The whole point of the detail line: an outcome the reader does not have
		// to tap for. It must not land inside the disclosure panel.
		render(
			<ActivityRow
				row={RAN}
				output={{
					mode: "inline",
					lines: ["7 entries"],
					lineCount: 1,
					needsFullView: false,
				}}
				stateKey="visible"
			>
				<div>details</div>
			</ActivityRow>,
		);
		expect(screen.getByRole("button")).toHaveAttribute(
			"aria-expanded",
			"false",
		);
		expect(screen.getByText("7 entries")).toBeInTheDocument();
	});

	it("omits the verb for the other kind", () => {
		render(
			<ActivityRow
				row={{
					...RAN,
					kind: "other",
					verb: "",
					object: "Load skill: superpowers:writing-plans",
				}}
			/>,
		);
		expect(screen.queryByText("Ran")).toBeNull();
		expect(
			screen.getByText("Load skill: superpowers:writing-plans"),
		).toBeInTheDocument();
	});

	it("marks a failed row", () => {
		const { container } = render(
			<ActivityRow row={{ ...RAN, failed: true }} />,
		);
		expect(container.querySelector(".activity-row--failed")).not.toBeNull();
	});

	it("renders chips and the overflow count", () => {
		render(
			<ActivityRow row={RAN} chips={["one.md", "two.md"]} extraChips={3} />,
		);
		expect(screen.getByText("one.md")).toBeInTheDocument();
		expect(screen.getByText("+3")).toBeInTheDocument();
	});

	it("exposes an expandable row as a button with its state", () => {
		render(
			<ActivityRow row={RAN} stateKey="k">
				<div>details</div>
			</ActivityRow>,
		);
		expect(screen.getByRole("button")).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	it("opens a failed row by default so its output is visible", () => {
		render(
			<ActivityRow row={{ ...RAN, failed: true }} stateKey="k2">
				<div>details</div>
			</ActivityRow>,
		);
		expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
	});

	it("keeps the unelided path in the accessibility tree", () => {
		render(
			<ActivityRow
				row={{
					...RAN,
					kind: "read",
					verb: "Read",
					object: "…/adrs/04-tax-basis.md",
					objectFull: "a/very/long/path/adrs/04-tax-basis.md",
					objectIsMono: true,
				}}
			/>,
		);
		// The shortened form is hidden from assistive technology and the full
		// path is rendered beside it, because a bare span has no role that
		// supports `aria-label`.
		expect(
			screen.getByText("a/very/long/path/adrs/04-tax-basis.md"),
		).toBeInTheDocument();
	});
});
