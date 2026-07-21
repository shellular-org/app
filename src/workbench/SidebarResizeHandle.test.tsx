import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SidebarResizeHandle from "./SidebarResizeHandle";

afterEach(() => {
	cleanup();
	document.documentElement.classList.remove("workbench-is-resizing");
	document.documentElement.style.removeProperty("--workbench-resize-cursor");
});

function Harness({ onEnd }: { onEnd: (width: number) => void }) {
	const [width, setWidth] = useState(300);
	return (
		<SidebarResizeHandle
			value={width}
			min={240}
			max={480}
			onResize={setWidth}
			onResizeEnd={onEnd}
		/>
	);
}

function startDrag() {
	const separator = screen.getByRole("separator", { name: "Resize sidebar" });
	fireEvent.pointerDown(separator, {
		button: 0,
		pointerId: 7,
		clientX: 300,
	});
	return separator;
}

describe("SidebarResizeHandle", () => {
	it("keeps dragging across rerenders and uses the latest callbacks", () => {
		const firstEnd = vi.fn();
		const secondEnd = vi.fn();
		const view = render(<Harness onEnd={firstEnd} />);
		const separator = startDrag();

		fireEvent.pointerMove(window, { pointerId: 7, clientX: 320 });
		expect(separator).toHaveAttribute("aria-valuenow", "320");
		expect(document.documentElement).toHaveClass("workbench-is-resizing");
		expect(firstEnd).not.toHaveBeenCalled();

		view.rerender(<Harness onEnd={secondEnd} />);
		fireEvent.pointerMove(window, { pointerId: 7, clientX: 350 });
		expect(separator).toHaveAttribute("aria-valuenow", "350");
		expect(document.documentElement).toHaveClass("workbench-is-resizing");

		fireEvent.pointerUp(window, { pointerId: 7 });
		expect(firstEnd).not.toHaveBeenCalled();
		expect(secondEnd).toHaveBeenCalledOnce();
		expect(secondEnd).toHaveBeenCalledWith(350);
		expect(document.documentElement).not.toHaveClass("workbench-is-resizing");
	});

	it("clamps movement and finishes on pointer cancellation", () => {
		const onEnd = vi.fn();
		const separator = render(<Harness onEnd={onEnd} />).getByRole("separator", {
			name: "Resize sidebar",
		});
		fireEvent.pointerDown(separator, {
			button: 0,
			pointerId: 3,
			clientX: 300,
		});
		fireEvent.pointerMove(window, { pointerId: 3, clientX: 900 });
		expect(separator).toHaveAttribute("aria-valuenow", "480");
		fireEvent.pointerCancel(window, { pointerId: 3 });
		expect(onEnd).toHaveBeenCalledWith(480);
		expect(document.documentElement).not.toHaveClass("workbench-is-resizing");
	});

	it("finishes with the latest width on window blur", () => {
		const onEnd = vi.fn();
		startDragAfterRender(onEnd);
		fireEvent.pointerMove(window, { pointerId: 7, clientX: 270 });
		fireEvent.blur(window);
		expect(onEnd).toHaveBeenCalledWith(270);
	});

	it("cleans up an active interaction when unmounted", () => {
		const onEnd = vi.fn();
		const view = render(<Harness onEnd={onEnd} />);
		startDrag();
		fireEvent.pointerMove(window, { pointerId: 7, clientX: 330 });
		view.unmount();
		expect(onEnd).toHaveBeenCalledWith(330);
		expect(document.documentElement).not.toHaveClass("workbench-is-resizing");
	});
});

function startDragAfterRender(onEnd: (width: number) => void) {
	render(<Harness onEnd={onEnd} />);
	return startDrag();
}
