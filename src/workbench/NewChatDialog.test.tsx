import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewChatDialog from "./NewChatDialog";
import { getWorkbenchSnapshot, resetWorkbench } from "./store";

const project = {
	name: "Alpha",
	path: "/work/alpha",
	gitInfo: { hasGit: true },
};
const agent = {
	id: "codex",
	name: "Codex",
	title: "Codex",
	available: true,
};

beforeEach(() => {
	localStorage.clear();
	resetWorkbench();
});
afterEach(cleanup);

describe("desktop New Chat dialog", () => {
	it("migrates the previous macOS project and agent preference", () => {
		localStorage.setItem(
			"shellular:mac-new-chat:v1:host-1",
			JSON.stringify({ projectPath: project.path, agentId: agent.id }),
		);
		const onClose = vi.fn();
		render(
			<NewChatDialog
				hostId="host-1"
				projects={[project as never]}
				agents={[agent as never]}
				onOpenFolder={vi.fn()}
				onClose={onClose}
			/>,
		);

		expect(screen.getByLabelText("Project")).toHaveValue(project.path);
		expect(screen.getByLabelText("Agent")).toHaveValue(agent.id);
		fireEvent.click(screen.getByRole("button", { name: "Start Chat" }));
		expect(getWorkbenchSnapshot().tabs[0]).toMatchObject({
			kind: "chat",
			workspacePath: project.path,
			agentId: agent.id,
		});
		expect(onClose).toHaveBeenCalledOnce();
		expect(
			localStorage.getItem("shellular:desktop-new-chat:v1:host-1"),
		).toContain(project.path);
	});
});
