import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openProjectPicker = vi.fn();

vi.mock("state", () => ({
	useShellular: () => ({
		connectionStatus: "connected",
		projects: [],
		loadingProjects: false,
	}),
}));
vi.mock("tabs/projects/useProjectPicker", () => ({
	default: () => ({ adding: false, openProjectPicker }),
}));
vi.mock("components/EmptyState", () => ({
	default: ({
		message,
		action,
	}: {
		message: string;
		action?: React.ReactNode;
	}) => (
		<div>
			<span>{message}</span>
			{action}
		</div>
	),
}));

import ProjectSidebar from "./ProjectSidebar";

beforeEach(() => vi.clearAllMocks());

describe("desktop project sidebar", () => {
	it("offers folder selection when there are no projects", () => {
		render(<ProjectSidebar />);
		const emptyMessage = screen.getByText("No projects yet");
		expect(emptyMessage).toBeVisible();
		expect(emptyMessage.closest(".workbench-project-list")).toHaveClass(
			"is-empty",
		);
		const buttons = screen.getAllByRole("button", { name: "Open Folder" });
		expect(buttons).toHaveLength(1);
		fireEvent.click(buttons[0]);
		expect(openProjectPicker).toHaveBeenCalledOnce();
	});
});
