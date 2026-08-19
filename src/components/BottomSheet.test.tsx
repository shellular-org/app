import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BottomSheet from "./BottomSheet";

afterEach(cleanup);

describe("BottomSheet", () => {
	it("keeps its mobile width and constrains the shared sheet on desktop", () => {
		render(
			<BottomSheet open onClose={vi.fn()} title="Sheet title">
				<div data-testid="sheet-content">Content</div>
			</BottomSheet>,
		);

		const panel = screen.getByTestId("sheet-content").parentElement;
		expect(panel).toHaveClass("w-full");
		expect(panel).toHaveClass("desktop-ui:w-[calc(100%-32px)]");
		expect(panel).toHaveClass("desktop-ui:max-w-[480px]");
	});
});
