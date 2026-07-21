import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DesktopMenuBar from "./DesktopMenuBar";

beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("desktop application menu", () => {
	it("moves between top-level menus with the arrow keys", () => {
		render(
			<DesktopMenuBar onCommand={vi.fn()} isCommandEnabled={() => true} />,
		);
		const file = screen.getByRole("menuitem", { name: "File" });
		file.focus();
		fireEvent.keyDown(file, { key: "ArrowRight" });
		expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
	});

	it("exposes disabled command state without removing the item", async () => {
		render(
			<DesktopMenuBar
				onCommand={vi.fn()}
				isCommandEnabled={(command) => command !== "save"}
			/>,
		);
		fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
		expect(
			await screen.findByRole("menuitem", { name: "Save" }),
		).toBeDisabled();
	});
});
