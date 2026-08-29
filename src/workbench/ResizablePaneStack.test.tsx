import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResizablePaneStack from "./ResizablePaneStack";

afterEach(cleanup);

describe("ResizablePaneStack", () => {
	it("renders collapsed headers and a keyboard-accessible adjacent sash", () => {
		const resize = vi.fn();
		const view = render(
			<ResizablePaneStack
				items={[
					{ id: "a", expanded: true, weight: 1 },
					{ id: "b", expanded: false, weight: 1 },
					{ id: "c", expanded: true, weight: 1 },
				]}
				onResize={resize}
				renderPane={(item) => <div>{item.id}</div>}
			/>,
		);
		Object.defineProperty(view.container.firstElementChild, "clientHeight", {
			configurable: true,
			value: 500,
		});

		expect(screen.getAllByRole("separator")).toHaveLength(1);
		const separator = screen.getByRole("separator");
		expect(separator.tagName).toBe("DIV");
		expect(separator).toHaveClass("workbench-divider", "is-interactive");
		expect(separator).toHaveAttribute("data-orientation", "horizontal");
		expect(separator).toHaveAttribute("data-extend-hit-area", "true");
		const dividers = view.container.querySelectorAll(".workbench-divider");
		expect(dividers).toHaveLength(2);
		expect(dividers[1]).toHaveAttribute("aria-hidden", "true");
		fireEvent.keyDown(separator, { key: "ArrowDown" });
		expect(resize).toHaveBeenCalledWith("a", "c", 0.05, (130 / 461) * 2);
		expect(screen.getByText("b").parentElement).toHaveStyle({
			flex: "0 0 34px",
		});
	});

	it("renders quiet decorative boundaries between adjacent collapsed tiles", () => {
		const view = render(
			<ResizablePaneStack
				items={[
					{ id: "a", expanded: true, weight: 1 },
					{ id: "b", expanded: false, weight: 1 },
					{ id: "c", expanded: false, weight: 1 },
					{ id: "d", expanded: true, weight: 1 },
				]}
				onResize={vi.fn()}
				renderPane={(item) => <div>{item.id}</div>}
			/>,
		);

		expect(view.container.querySelectorAll(".workbench-divider")).toHaveLength(
			3,
		);
		expect(screen.getAllByRole("separator")).toHaveLength(1);
		expect(
			view.container.querySelectorAll('.workbench-divider[aria-hidden="true"]'),
		).toHaveLength(2);
	});

	it("reports pointer movement incrementally instead of compounding drag delta", () => {
		const resize = vi.fn();
		render(
			<ResizablePaneStack
				items={[
					{ id: "a", expanded: true, weight: 1 },
					{ id: "b", expanded: true, weight: 1 },
				]}
				onResize={resize}
				renderPane={(item) => <div>{item.id}</div>}
			/>,
		);
		const sash = screen.getByRole("separator");
		Object.defineProperty(sash.parentElement?.parentElement, "clientHeight", {
			configurable: true,
			value: 200,
		});
		fireEvent.pointerDown(sash, { clientY: 10 });
		fireEvent.pointerMove(window, { clientY: 20 });
		fireEvent.pointerMove(window, { clientY: 25 });
		fireEvent.pointerUp(window);

		expect(resize.mock.calls[0][2]).toBeCloseTo(0.1);
		expect(resize.mock.calls[1][2]).toBeCloseTo(0.05);
	});
});
