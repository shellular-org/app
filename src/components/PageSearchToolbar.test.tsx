import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import PageSearchToolbar from "./PageSearchToolbar";

describe("PageSearchToolbar", () => {
	it("supports query changes, clearing, and Escape dismissal", () => {
		const onChange = vi.fn();
		const onDismiss = vi.fn();
		const inputRef = createRef<HTMLInputElement>();
		render(
			<PageSearchToolbar
				value="session"
				onChange={onChange}
				onDismiss={onDismiss}
				placeholder="Search chats"
				ariaLabel="Search sessions"
				inputRef={inputRef}
			/>,
		);

		const input = screen.getByRole("searchbox", { name: "Search sessions" });
		expect(inputRef.current).toBe(input);
		fireEvent.change(input, { target: { value: "next" } });
		expect(onChange).toHaveBeenCalledWith("next");

		fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
		expect(onChange).toHaveBeenCalledWith("");

		fireEvent.keyDown(input, { key: "Escape" });
		expect(onDismiss).toHaveBeenCalledOnce();
		expect(screen.queryByRole("button", { name: "Close search" })).toBeNull();
	});
});
