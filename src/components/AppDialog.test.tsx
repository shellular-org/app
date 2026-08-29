import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AppDialogHost, { openAppDialog } from "./AppDialog";

afterEach(cleanup);

describe("app dialog", () => {
	it("returns a selected project value", async () => {
		render(<AppDialogHost />);
		let result: Promise<string | null> | undefined;
		act(() => {
			result = openAppDialog("select", {
				title: "Choose Project",
				message: "Choose a project.",
				options: [
					{ value: "/alpha", label: "Alpha" },
					{ value: "/beta", label: "Beta" },
				],
			});
		});
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "/beta" },
		});
		fireEvent.click(screen.getByRole("button", { name: "OK" }));
		await expect(result).resolves.toBe("/beta");
	});

	it("returns a selected project and filename together", async () => {
		render(<AppDialogHost />);
		let result:
			| Promise<{ selectedValue: string; textValue: string } | null>
			| undefined;
		act(() => {
			result = openAppDialog("select-text", {
				title: "New File",
				message: "Choose a project and enter a filename.",
				selectLabel: "Project",
				textLabel: "Filename",
				options: [
					{ value: "/alpha", label: "Alpha" },
					{ value: "/beta", label: "Beta" },
				],
			});
		});
		fireEvent.change(screen.getByRole("combobox", { name: "Project" }), {
			target: { value: "/beta" },
		});
		fireEvent.change(screen.getByRole("textbox", { name: "Filename" }), {
			target: { value: "index.ts" },
		});
		fireEvent.click(screen.getByRole("button", { name: "OK" }));
		await expect(result).resolves.toEqual({
			selectedValue: "/beta",
			textValue: "index.ts",
		});
	});
});
