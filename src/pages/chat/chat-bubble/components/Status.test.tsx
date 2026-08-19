import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Status from "./Status";

afterEach(cleanup);

describe("Status", () => {
	it("renders nothing without a status", () => {
		const { container } = render(<Status />);
		expect(container.firstChild).toBeNull();
	});

	it("marks an unrecognised terminal status as a failure, not as unknown", () => {
		const { container } = render(<Status status="cancelled" />);
		expect(container.querySelector(".icon-alert-triangle")).not.toBeNull();
		expect(container.querySelector(".icon-help-center")).toBeNull();
	});

	it("keeps the spinner for a running call", () => {
		const { container } = render(<Status status="in_progress" />);
		expect(container.querySelector(".chat-status-spinner")).not.toBeNull();
	});

	it("distinguishes waiting from running", () => {
		// A call blocked on a permission is not busy, it is blocked. Kiro ships
		// this as its third glyph; Codex calls it "Needs input".
		const { container } = render(<Status status="awaiting" />);
		expect(container.querySelector(".chat-status-spinner")).toBeNull();
		expect(container.querySelector(".icon-clock")).not.toBeNull();
	});

	it("gives every state its own shape, not only its own colour", () => {
		// WCAG SC 1.4.1 (Level A): "if content relies on accurately perceiving a
		// particular color, an additional visual indicator is required
		// regardless of contrast ratio".
		const shapes = ["completed", "failed", "awaiting"].map((status) => {
			const { container, unmount } = render(<Status status={status} />);
			const className = container.firstElementChild?.className ?? "";
			unmount();
			return className;
		});
		expect(new Set(shapes).size).toBe(3);
	});

	it("names each state for assistive technology", () => {
		const { getByLabelText } = render(<Status status="failed" />);
		expect(getByLabelText("Failed")).toBeInTheDocument();
	});
});
