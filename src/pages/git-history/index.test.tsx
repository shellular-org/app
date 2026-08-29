import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GitHistoryPage from ".";

const mocks = vi.hoisted(() => ({
	pushPage: vi.fn(),
	getGitLog: vi.fn(),
	getCommitFiles: vi.fn(),
}));

vi.mock("App", () => ({ pushPage: mocks.pushPage }));
vi.mock("state", () => ({
	useShellular: () => ({
		connectionStatus: "connected",
		getGitLog: mocks.getGitLog,
		getCommitFiles: mocks.getCommitFiles,
	}),
}));

describe("GitHistoryPage", () => {
	beforeEach(() => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		mocks.getGitLog.mockResolvedValue({
			commits: [
				{
					hash: "abcdef123456",
					shortHash: "abcdef1",
					subject: "Improve workbench navigation",
					author: "Dev",
					timestamp: Math.floor(Date.now() / 1000),
				},
			],
			hasMore: false,
		});
		mocks.getCommitFiles.mockResolvedValue([
			{ path: "src/workbench.tsx", status: "modified" },
		]);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	it("delegates embedded commit selection without pushing a page", async () => {
		const onSelectCommit = vi.fn();
		render(
			<GitHistoryPage
				projectPath="/repo"
				projectName="Repo"
				embedded
				onSelectCommit={onSelectCommit}
			/>,
		);

		const row = await screen.findByRole("button", {
			name: /Improve workbench navigation/,
		});
		fireEvent.click(row);
		expect(onSelectCommit).toHaveBeenCalledWith(
			expect.objectContaining({ hash: "abcdef123456" }),
		);
		expect(row).toHaveAttribute("aria-current", "true");
		expect(mocks.pushPage).not.toHaveBeenCalled();
	});
});
