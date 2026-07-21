import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("lib/auth", () => ({
	useAuth: () => ({
		user: {
			name: "Alex Kim",
			email: "alex@example.com",
			avatarUrl: null,
		},
	}),
}));

import DesktopProfileMenu from "./DesktopProfileMenu";

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

afterEach(cleanup);

describe("DesktopProfileMenu", () => {
	it("shows identity and consolidated account destinations", async () => {
		const onOpen = vi.fn();
		render(<DesktopProfileMenu onOpen={onOpen} />);

		fireEvent.click(screen.getByRole("button", { name: "User menu" }));
		const menu = screen.getByRole("menu");
		expect(within(menu).getByText("Alex Kim")).toBeVisible();
		expect(within(menu).getByText("alex@example.com")).toBeVisible();
		expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((item) => item.textContent),
		).toEqual(["Profile", "Agents", "Settings", "Reach Out", "About"]);

		fireEvent.click(within(menu).getByRole("menuitem", { name: "Settings" }));
		expect(onOpen).toHaveBeenCalledWith("settings");
		await waitFor(() => expect(menu).toHaveAttribute("data-closed"));
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "User menu" })).toHaveFocus(),
		);
	});
});
