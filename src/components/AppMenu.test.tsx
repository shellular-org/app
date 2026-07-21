import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ContextMenuHost from "context-menu/ContextMenuHost";
import { dismissContextMenu } from "context-menu/service";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppMenu from "./AppMenu";

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

afterEach(() => {
	dismissContextMenu(false);
	vi.unstubAllEnvs();
	cleanup();
});

describe("AppMenu", () => {
	it("renders checked application choices with radio semantics", () => {
		render(
			<AppMenu
				ariaLabel="View menu"
				items={[
					{
						icon: "icon-list",
						label: "List View",
						radio: true,
						checked: true,
						onClick: vi.fn(),
					},
					{
						icon: "icon-folder",
						label: "Tree View",
						radio: true,
						checked: false,
						onClick: vi.fn(),
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "View menu" }));
		expect(
			screen.getByRole("menuitemradio", { name: "List View" }),
		).toHaveAttribute("aria-checked", "true");
		expect(
			screen.getByRole("menuitemradio", { name: "Tree View" }),
		).toHaveAttribute("aria-checked", "false");
	});

	it("uses the shared desktop presenter for contextual overflow actions", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		const action = vi.fn();
		render(
			<>
				<ContextMenuHost />
				<AppMenu
					ariaLabel="File actions"
					items={[
						{
							icon: "icon-copy",
							label: "Copy Path",
							onClick: action,
						},
					]}
				/>
			</>,
		);
		fireEvent.click(screen.getByRole("button", { name: "File actions" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Copy Path" }));
		expect(action).toHaveBeenCalledOnce();
	});
});
