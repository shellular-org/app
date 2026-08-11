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
			<DesktopMenuBar
				onCommand={vi.fn()}
				isCommandEnabled={() => true}
				contextualNew="new-file"
			/>,
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
				contextualNew="new-file"
			/>,
		);
		fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
		expect(
			await screen.findByRole("menuitem", { name: "Save" }),
		).toBeDisabled();
	});

	it("shows VS Code shortcuts on the active contextual New command", async () => {
		render(
			<DesktopMenuBar
				onCommand={vi.fn()}
				isCommandEnabled={() => true}
				contextualNew="new-chat"
			/>,
		);
		fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
		const newChat = await screen.findByRole("menuitem", { name: "New Chat" });
		expect(newChat).toHaveTextContent("Ctrl+N");
		expect(
			screen.getByRole("menuitem", { name: "New File" }),
		).not.toHaveTextContent("Ctrl+N");
		expect(
			screen.getByRole("menuitem", { name: "New Terminal" }),
		).toHaveTextContent("Ctrl+Shift+`");
	});
});
