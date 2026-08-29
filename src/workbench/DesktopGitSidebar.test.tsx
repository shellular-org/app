import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { GitWorkingTreeFile } from "state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(async () => true),
}));

vi.mock("bridge/dialog", () => ({
	default: { confirm: mocks.confirm },
}));
vi.mock("components/AppMenu", () => ({
	default: ({
		children,
		ariaLabel,
		items,
	}: {
		children: React.ReactNode;
		ariaLabel: string;
		items: Array<{
			icon: string;
			label: string;
			onClick: () => void;
			radio?: boolean;
			checked?: boolean;
		}>;
	}) => (
		<>
			<button type="button" aria-label={ariaLabel}>
				{children}
			</button>
			{items.map((item) =>
				item.radio ? (
					<button
						type="button"
						key={item.label}
						role="menuitemradio"
						aria-checked={item.checked}
						onClick={item.onClick}
					>
						<span className={item.icon} aria-hidden="true" />
						{item.label}
					</button>
				) : (
					<button type="button" key={item.label} onClick={item.onClick}>
						<span className={item.icon} aria-hidden="true" />
						{item.label}
					</button>
				),
			)}
		</>
	),
}));
vi.mock("context-menu/ContextMenuButton", () => ({
	default: ({
		children,
		ariaLabel,
		target,
	}: {
		children: React.ReactNode;
		ariaLabel: string;
		target: {
			handlers: Record<
				string,
				{
					run: () => void;
					label?: string | (() => string);
					visible?: boolean | (() => boolean);
					checked?: boolean | (() => boolean);
				}
			>;
		};
	}) => (
		<>
			<button type="button" aria-label={ariaLabel}>
				{children}
			</button>
			{Object.entries(target.handlers).map(([command, handler]) => {
				const defaultLabels: Record<string, string> = {
					"git.fetch": "Fetch",
					"git.history": "Open History",
					"git.listView": "List View",
					"git.pull": "Pull",
					"git.push": "Push",
					"git.switchBranch": "Switch Branch…",
					"git.treeView": "Tree View",
					"resource.refresh": "Refresh",
				};
				const visible =
					typeof handler.visible === "function"
						? handler.visible()
						: (handler.visible ?? true);
				if (!visible) return null;
				const label =
					typeof handler.label === "function"
						? handler.label()
						: (handler.label ?? defaultLabels[command] ?? command);
				const checked =
					typeof handler.checked === "function"
						? handler.checked()
						: handler.checked;
				const radio = command === "git.listView" || command === "git.treeView";
				return (
					<button
						type="button"
						key={command}
						{...(radio
							? {
									role: "menuitemradio" as const,
									"aria-checked": Boolean(checked),
								}
							: {})}
						onClick={handler.run}
					>
						{radio && (
							<span
								className={
									command === "git.treeView" ? "icon-account_tree" : "icon-list"
								}
								aria-hidden="true"
							/>
						)}
						{label}
					</button>
				);
			})}
		</>
	),
}));
vi.mock("./ShellularFileTree", () => ({
	pruneShellularFileTreeCache: vi.fn(),
	default: ({ entries }: { entries: Array<{ path: string }> }) => (
		<div data-testid="git-tree">
			{entries.map((entry) => entry.path).join(",")}
		</div>
	),
}));
vi.mock("state/connection", () => ({
	getHostInfo: () => ({ id: "test-host" }),
}));

import DesktopGitSidebar from "./DesktopGitSidebar";
import type { DesktopGitWorkspace } from "./gitWorkspace";
import { getWorkbenchSnapshot, resetWorkbench } from "./store";

const file = (
	path: string,
	options: Partial<GitWorkingTreeFile>,
): GitWorkingTreeFile => ({
	path,
	status: "modified",
	indexStatus: ".",
	worktreeStatus: "M",
	staged: false,
	unstaged: true,
	untracked: false,
	...options,
});

const project = {
	name: "Alpha",
	path: "/work/alpha",
	gitInfo: { hasGit: true },
} as never;

const defaultFiles = [
	file("src/staged.ts", {
		indexStatus: "M",
		worktreeStatus: ".",
		staged: true,
		unstaged: false,
	}),
	file("src/changed.ts", {}),
];

function workspace(options?: {
	files?: GitWorkingTreeFile[];
	run?: DesktopGitWorkspace["run"];
}): DesktopGitWorkspace {
	const files = options?.files ?? defaultFiles;
	return {
		repositories: [project],
		states: {
			"/work/alpha": {
				status: {
					hasGit: true,
					branch: "main",
					ahead: 1,
					behind: 0,
					staged: files.filter((entry) => entry.staged).length,
					unstaged: files.filter((entry) => entry.unstaged).length,
					untracked: files.filter((entry) => entry.untracked).length,
					files,
				},
				loading: false,
				error: null,
				busy: null,
				processingPaths: new Set(),
				selectionTarget: null,
				selectedPaths: new Set(),
				selectionAnchor: null,
				revision: 0,
			},
		},
		totalChanges: files.length,
		refresh: vi.fn(async () => undefined),
		refreshAll: vi.fn(async () => undefined),
		select: vi.fn(),
		run:
			options?.run ??
			(vi.fn(async () => ({ ok: true })) as DesktopGitWorkspace["run"]),
	};
}

function enterCommitMessage(message = "Ship it") {
	const input = screen.getByPlaceholderText("Message (⌘Enter to commit)");
	fireEvent.change(input, { target: { value: message } });
	return input;
}

beforeEach(() => {
	localStorage.clear();
	resetWorkbench();
	mocks.confirm.mockReset();
	mocks.confirm.mockResolvedValue(true);
});
afterEach(cleanup);

describe("DesktopGitSidebar", () => {
	it("starts with repository context and omits redundant Source Control chrome", () => {
		render(<DesktopGitSidebar workspace={workspace()} />);
		expect(screen.queryByText("Source Control")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Refresh all repositories" }),
		).toBeNull();
		expect(screen.getByRole("button", { name: "Refresh" })).toBeVisible();

		const projectButton = screen.getByText("Alpha").closest("button");
		expect(projectButton?.querySelector(".icon-git-branch")).toBeNull();
		const branchButton = screen.getByRole("button", {
			name: "Switch branch, current branch main",
		});
		expect(branchButton).toHaveTextContent("main");
		expect(branchButton.closest("header")).toBeNull();
		expect(branchButton.parentElement).toHaveClass("h-7", "w-full");
		expect(projectButton).toHaveClass("h-full", "flex-1");
		expect(projectButton?.closest("section")).toHaveClass("bg-transparent");
		fireEvent.click(projectButton as HTMLButtonElement);
		expect(
			screen.queryByRole("button", {
				name: "Switch branch, current branch main",
			}),
		).toBeNull();
		fireEvent.click(screen.getByText("Alpha").closest("button") as HTMLElement);
		expect(
			screen.getByRole("button", {
				name: "Switch branch, current branch main",
			}),
		).toBeVisible();
	});

	it("synchronizes by pulling before pushing", async () => {
		const run = vi.fn(async () => ({ ok: true }));
		render(
			<DesktopGitSidebar
				workspace={workspace({ run: run as DesktopGitWorkspace["run"] })}
			/>,
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Synchronize main, ↑1" }),
		);
		await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		expect(mocks.confirm).toHaveBeenCalledWith(
			"Sync with local changes? Git may refuse if files conflict.",
			"Sync Changes",
		);
		expect(run.mock.calls).toEqual([
			["/work/alpha", "pull", {}],
			["/work/alpha", "push", {}],
		]);
	});

	it("does not push when the sync pull fails", async () => {
		const run = vi.fn(async (_path: string, operation: string) => {
			if (operation === "pull") throw new Error("pull failed");
			return { ok: true };
		});
		render(
			<DesktopGitSidebar
				workspace={workspace({ run: run as DesktopGitWorkspace["run"] })}
			/>,
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Synchronize main, ↑1" }),
		);
		await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
		expect(run).toHaveBeenCalledWith("/work/alpha", "pull", {});
	});

	it("separates staged and unstaged groups and opens target-specific diffs", () => {
		render(<DesktopGitSidebar workspace={workspace()} />);

		const stagedHeader = screen.getByText("Staged Changes").closest("header");
		const changesHeader = screen.getByText("Changes").closest("header");
		expect(stagedHeader).toHaveClass("sticky", "top-0", "h-7");
		expect(changesHeader).toHaveClass("sticky", "top-0", "h-7");
		expect(stagedHeader).not.toHaveClass("border", "border-b");
		const stagedCount = within(stagedHeader as HTMLElement).getByTitle(
			"1 change",
		);
		expect(stagedCount).toHaveClass("text-right", "tabular-nums");
		expect(stagedCount.parentElement?.lastElementChild).toBe(stagedCount);

		const stagedToggle = screen.getByText("Staged Changes").closest("button");
		expect(stagedToggle).toHaveAttribute("aria-expanded", "true");
		const unstageAll = screen.getByRole("button", {
			name: "Unstage all Staged Changes",
		});
		expect(unstageAll).toHaveClass("size-6");
		fireEvent.click(unstageAll);
		expect(stagedToggle).toHaveAttribute("aria-expanded", "true");
		const stagedButton = screen.getByText("staged.ts").closest("button");
		expect(stagedButton).toBeInstanceOf(HTMLButtonElement);
		fireEvent.click(stagedButton as HTMLButtonElement);
		expect(getWorkbenchSnapshot().surfaces[0]).toMatchObject({
			id: "git-diff:/work/alpha:head-to-index:src/staged.ts",
			comparison: {
				kind: "working-tree",
				projectPath: "/work/alpha",
				relativePath: "src/staged.ts",
				target: "head-to-index",
			},
		});

		const changedButton = screen.getByText("changed.ts").closest("button");
		expect(changedButton).toBeInstanceOf(HTMLButtonElement);
		fireEvent.click(changedButton as HTMLButtonElement);
		expect(getWorkbenchSnapshot().surfaces[1]).toMatchObject({
			id: "git-diff:/work/alpha:index-to-worktree:src/changed.ts",
			comparison: {
				kind: "working-tree",
				target: "index-to-worktree",
			},
		});
	});

	it("fills list rows and uses the Trees icon with explicit filename spacing", () => {
		render(<DesktopGitSidebar workspace={workspace()} />);
		const filename = screen.getByText("changed.ts").closest("button");
		const stage = screen.getByRole("button", { name: "stage src/changed.ts" });
		expect(filename).toBeInstanceOf(HTMLButtonElement);
		expect(filename).toHaveClass("flex", "gap-1.5", "min-w-0", "flex-1");
		expect(filename?.parentElement).toHaveClass("w-full", "min-w-0");
		expect(filename?.closest("section")?.parentElement).toHaveClass(
			"w-full",
			"min-w-0",
			"overflow-x-hidden",
		);
		expect(
			filename?.querySelector('[data-icon-token="typescript"]'),
		).not.toBeNull();
		expect(
			filename?.querySelector('[data-icon-token="typescript"]'),
		).toHaveStyle({ color: "var(--secondary-text)" });
		expect(screen.getByText("changed.ts")).toHaveClass("truncate", "min-w-0");
		expect(screen.getByText("changed.ts")).not.toHaveAttribute("style");
		expect(filename?.nextElementSibling).toContainElement(stage);
		expect(stage).toHaveClass("text-secondary-text");
		expect(screen.queryByText("src")).toBeNull();
	});

	it("uses the same unframed status lane and semantic colors as Trees", () => {
		const files = [
			file("staged.ts", {
				status: "staged",
				indexStatus: "M",
				worktreeStatus: ".",
				staged: true,
				unstaged: false,
			}),
			file("new.ts", {
				status: "untracked",
				indexStatus: "?",
				worktreeStatus: "?",
				untracked: true,
			}),
			file("ignored.ts", { status: "ignored" }),
		];
		render(<DesktopGitSidebar workspace={workspace({ files })} />);

		const staged = screen.getByRole("img", { name: "Git status: modified" });
		expect(staged).toHaveTextContent("M");
		expect(staged).toHaveClass("w-3", "text-xs");
		expect(staged).not.toHaveClass("border", "rounded");
		expect(staged).toHaveStyle({ color: "var(--warning)" });

		const untracked = screen.getByRole("img", {
			name: "Git status: untracked",
		});
		expect(untracked).toHaveTextContent("U");
		expect(untracked).toHaveStyle({ color: "var(--success)" });

		const ignored = screen.getByRole("img", { name: "Git status: ignored" });
		expect(ignored).toBeEmptyDOMElement();
		expect(screen.getByText("ignored.ts")).not.toHaveAttribute("style");
		for (const name of ["staged.ts", "new.ts", "ignored.ts"]) {
			const filename = screen.getByText(name);
			expect(filename).not.toHaveAttribute("style");
			expect(filename.closest("button")?.querySelector("svg")).toHaveStyle({
				color: "var(--secondary-text)",
			});
		}
	});

	it("enables the themed commit controls for a message and commits staged files", async () => {
		const run = vi.fn(async () => ({ ok: true }));
		render(
			<DesktopGitSidebar
				workspace={workspace({ run: run as DesktopGitWorkspace["run"] })}
			/>,
		);
		const commitButton = screen.getByRole("button", { name: "Commit" });
		expect(commitButton).toBeDisabled();
		expect(commitButton).toHaveAttribute("title", "Enter a commit message");
		expect(commitButton).toHaveClass(
			"bg-button-background",
			"text-button-text",
		);
		expect(commitButton).not.toHaveClass("text-white");

		enterCommitMessage();
		expect(commitButton).toBeEnabled();
		fireEvent.click(commitButton);

		await waitFor(() =>
			expect(run).toHaveBeenCalledWith("/work/alpha", "commit", {
				message: "Ship it",
			}),
		);
		expect(run).not.toHaveBeenCalledWith(
			"/work/alpha",
			"stage",
			expect.anything(),
		);
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	it("confirms and stages all paths before committing when nothing is staged", async () => {
		const files = [
			file("src/changed.ts", {}),
			file("new.ts", {
				status: "untracked",
				indexStatus: "?",
				worktreeStatus: "?",
				untracked: true,
			}),
		];
		const run = vi.fn(async () => ({ ok: true }));
		render(
			<DesktopGitSidebar
				workspace={workspace({
					files,
					run: run as DesktopGitWorkspace["run"],
				})}
			/>,
		);
		enterCommitMessage("Stage everything");
		fireEvent.click(screen.getByRole("button", { name: "Commit" }));

		await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		expect(mocks.confirm).toHaveBeenCalledWith(
			"No changes are staged. Stage all 2 changed files and commit?",
			"Stage All and Commit",
		);
		expect(run.mock.calls).toEqual([
			["/work/alpha", "stage", { files: ["src/changed.ts", "new.ts"] }],
			["/work/alpha", "commit", { message: "Stage everything" }],
		]);
	});

	it("leaves the repository unchanged when stage-all confirmation is canceled", async () => {
		mocks.confirm.mockResolvedValue(false);
		const run = vi.fn(async () => ({ ok: true }));
		render(
			<DesktopGitSidebar
				workspace={workspace({
					files: [file("changed.ts", {})],
					run: run as DesktopGitWorkspace["run"],
				})}
			/>,
		);
		enterCommitMessage();
		fireEvent.click(screen.getByRole("button", { name: "Commit" }));

		await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
		expect(run).not.toHaveBeenCalled();
	});

	it("does not commit if staging fails", async () => {
		const run = vi.fn(async (_path: string, operation: string) => {
			if (operation === "stage") throw new Error("stage failed");
			return { ok: true };
		});
		render(
			<DesktopGitSidebar
				workspace={workspace({
					files: [file("changed.ts", {})],
					run: run as DesktopGitWorkspace["run"],
				})}
			/>,
		);
		enterCommitMessage();
		fireEvent.click(screen.getByRole("button", { name: "Commit" }));

		await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
		expect(run).toHaveBeenCalledWith("/work/alpha", "stage", {
			files: ["changed.ts"],
		});
	});

	it("uses the same commit flow for the keyboard shortcut and Commit & Push", async () => {
		const keyboardRun = vi.fn(async () => ({ ok: true }));
		const first = render(
			<DesktopGitSidebar
				workspace={workspace({
					run: keyboardRun as DesktopGitWorkspace["run"],
				})}
			/>,
		);
		const input = enterCommitMessage("Keyboard commit");
		fireEvent.keyDown(input, { key: "Enter", metaKey: true });
		await waitFor(() => expect(keyboardRun).toHaveBeenCalledTimes(1));
		expect(keyboardRun).toHaveBeenCalledWith("/work/alpha", "commit", {
			message: "Keyboard commit",
		});
		first.unmount();

		const pushRun = vi.fn(async () => ({ ok: true }));
		render(
			<DesktopGitSidebar
				workspace={workspace({ run: pushRun as DesktopGitWorkspace["run"] })}
			/>,
		);
		enterCommitMessage("Commit then push");
		fireEvent.click(screen.getByRole("button", { name: "Commit and push" }));
		await waitFor(() => expect(pushRun).toHaveBeenCalledTimes(2));
		expect(pushRun.mock.calls).toEqual([
			["/work/alpha", "commit", { message: "Commit then push" }],
			["/work/alpha", "push", {}],
		]);
	});

	it("switches and persists List/Tree independently of the branch dialog", async () => {
		const run = vi.fn(async (_path: string, operation: string) =>
			operation === "branches" ? { branches: [] } : { ok: true },
		);
		render(
			<DesktopGitSidebar
				workspace={workspace({ run: run as DesktopGitWorkspace["run"] })}
			/>,
		);
		const treeButton = screen.getByRole("menuitemradio", { name: "Tree View" });
		expect(treeButton).toBeVisible();
		expect(treeButton.querySelector(".icon-account_tree")).not.toBeNull();
		expect(
			screen.getByRole("menuitemradio", { name: "List View" }),
		).toHaveAttribute("aria-checked", "true");
		fireEvent.click(treeButton);
		expect(
			screen.getByRole("menuitemradio", { name: "Tree View" }),
		).toHaveAttribute("aria-checked", "true");
		expect(
			localStorage.getItem("shellular:desktop-git-view:v1:/work/alpha"),
		).toBe("tree");
		expect(screen.getAllByTestId("git-tree")).toHaveLength(2);
		expect(screen.getAllByTestId("git-tree")[0].parentElement).toHaveClass(
			"flex",
			"flex-1",
			"min-h-0",
			"w-full",
			"overflow-hidden",
		);

		fireEvent.click(screen.getByText("main").closest("button") as HTMLElement);
		expect(await screen.findByRole("dialog")).toBeVisible();
		fireEvent.click(
			screen.getByRole("button", { name: "Close branch dialog" }),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		fireEvent.click(screen.getByRole("menuitemradio", { name: "List View" }));
		expect(
			screen.getByRole("menuitemradio", { name: "List View" }),
		).toHaveAttribute("aria-checked", "true");
		expect(
			localStorage.getItem("shellular:desktop-git-view:v1:/work/alpha"),
		).toBe("list");
	});
});
