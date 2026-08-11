import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./MacProjectSidebar", () => ({
	default: () => (
		<div data-testid="desktop-project-sidebar">Tree / Sessions</div>
	),
}));

import ProjectSidebar from "./ProjectSidebar";

describe("desktop project sidebar", () => {
	it("uses the shared resizable Tree and Sessions workspace", () => {
		render(<ProjectSidebar />);
		expect(screen.getByTestId("desktop-project-sidebar")).toHaveTextContent(
			"Tree / Sessions",
		);
	});
});
