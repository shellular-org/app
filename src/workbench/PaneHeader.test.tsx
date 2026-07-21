import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NestedPaneHeader, PANE_HEADER_ICON_CLASS } from "./PaneHeader";

afterEach(cleanup);

describe("NestedPaneHeader", () => {
	it("keeps toggling, actions, and the trailing count visually distinct", () => {
		const onToggle = vi.fn();
		const onAction = vi.fn();
		render(
			<NestedPaneHeader
				expanded
				label="Staged Changes"
				count={12}
				onToggle={onToggle}
				action={
					<button
						type="button"
						className={PANE_HEADER_ICON_CLASS}
						onClick={onAction}
					>
						Stage all
					</button>
				}
			/>,
		);

		const label = screen.getByText("Staged Changes");
		const header = label.closest("header");
		const toggle = label.closest("button");
		const action = screen.getByRole("button", { name: "Stage all" });
		const count = screen.getByTitle("12 changes");

		expect(header).toHaveClass("sticky", "top-0", "h-7", "justify-between");
		expect(header).not.toHaveClass("border", "border-b");
		expect(toggle).toHaveAttribute("aria-expanded", "true");
		expect(count).toHaveClass("text-right", "tabular-nums");
		expect(count.parentElement?.lastElementChild).toBe(count);

		fireEvent.click(action);
		expect(onAction).toHaveBeenCalledOnce();
		expect(onToggle).not.toHaveBeenCalled();
		fireEvent.click(toggle as HTMLButtonElement);
		expect(onToggle).toHaveBeenCalledOnce();
	});
});
