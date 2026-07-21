import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { GitBranch } from "state";
import { afterEach, describe, expect, it, vi } from "vitest";
import DesktopBranchDialog, {
	type DesktopBranchDialogProps,
} from "./DesktopBranchDialog";

const branches: GitBranch[] = [
	{
		name: "main",
		ref: "refs/heads/main",
		remote: false,
		current: true,
		default: true,
	},
	{
		name: "feature/search",
		ref: "refs/heads/feature/search",
		remote: false,
		current: false,
		default: false,
	},
	{
		name: "origin/main",
		ref: "refs/remotes/origin/main",
		remote: true,
		current: false,
		default: false,
	},
];

function props(
	overrides: Partial<DesktopBranchDialogProps> = {},
): DesktopBranchDialogProps {
	return {
		activeBranchRef: null,
		branches,
		busy: null,
		error: null,
		loading: false,
		onClose: vi.fn(),
		onCreate: vi.fn(async () => undefined),
		onDelete: vi.fn(async () => undefined),
		onDismissError: vi.fn(),
		onRetry: vi.fn(),
		onSelect: vi.fn(async () => undefined),
		...overrides,
	};
}

afterEach(cleanup);

describe("DesktopBranchDialog", () => {
	it("groups, searches, and selects desktop branches", async () => {
		const input = props();
		render(<DesktopBranchDialog {...input} />);

		expect(screen.getByRole("dialog")).toBeVisible();
		await waitFor(() =>
			expect(screen.getByPlaceholderText("Find a branch")).toHaveFocus(),
		);
		expect(screen.getByRole("heading", { name: "Local" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Remote" })).toBeVisible();
		const currentBranch = screen.getByText("main").closest("button");
		expect(currentBranch).toBeInstanceOf(HTMLButtonElement);
		expect(currentBranch).toBeDisabled();
		expect(screen.getByText("Default")).toBeVisible();

		fireEvent.change(screen.getByPlaceholderText("Find a branch"), {
			target: { value: "feature" },
		});
		expect(screen.queryByText("origin/main")).toBeNull();
		const featureBranch = screen.getByText("feature/search").closest("button");
		expect(featureBranch).toBeInstanceOf(HTMLButtonElement);
		fireEvent.click(featureBranch as HTMLButtonElement);
		await waitFor(() =>
			expect(input.onSelect).toHaveBeenCalledWith(branches[1]),
		);
	});

	it("creates and deletes local branches with themed controls", async () => {
		const input = props();
		render(<DesktopBranchDialog {...input} />);

		const newBranch = screen.getByRole("button", { name: "New branch" });
		expect(newBranch).toHaveClass("bg-button-background", "text-button-text");
		fireEvent.click(newBranch);
		fireEvent.change(screen.getByPlaceholderText("feature/branch-name"), {
			target: { value: "fix/contrast" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create branch" }));
		await waitFor(() =>
			expect(input.onCreate).toHaveBeenCalledWith("fix/contrast"),
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Delete branch feature/search" }),
		);
		await waitFor(() =>
			expect(input.onDelete).toHaveBeenCalledWith(branches[1]),
		);
	});

	it("opens immediately while loading and exposes recoverable errors", () => {
		const input = props({
			branches: [],
			loading: true,
			error: {
				title: "Couldn't load branches",
				message: "Connection lost",
				canForceDelete: false,
			},
		});
		render(<DesktopBranchDialog {...input} />);

		expect(screen.getByRole("dialog")).toBeVisible();
		expect(screen.getAllByText("Loading branches…")).toHaveLength(2);
		expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
		const retry = screen.getByRole("button", { name: "Retry" });
		expect(retry).toBeDisabled();
		fireEvent.click(
			screen.getByRole("button", { name: "Dismiss branch error" }),
		);
		expect(input.onDismissError).toHaveBeenCalledOnce();
	});

	it("supports retry and explicit force deletion after a branch error", () => {
		const input = props({
			error: {
				title: "Branch isn't fully merged",
				message: "Work may be lost",
				branch: branches[1],
				canForceDelete: true,
			},
		});
		render(<DesktopBranchDialog {...input} />);

		const forceDelete = screen.getByRole("button", { name: "Force delete" });
		expect(forceDelete).toHaveClass("text-danger");
		fireEvent.click(forceDelete);
		expect(input.onDelete).toHaveBeenCalledWith(branches[1], true);
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(input.onRetry).toHaveBeenCalledOnce();
	});

	it("closes from the backdrop or Escape and blocks dismissal during a mutation", async () => {
		const close = vi.fn();
		const first = render(
			<DesktopBranchDialog {...props({ onClose: close })} />,
		);
		const backdrop = screen
			.getByRole("dialog")
			.querySelector<HTMLElement>("[aria-hidden='true'][data-open]");
		expect(backdrop).toBeInstanceOf(HTMLElement);
		fireEvent.mouseDown(backdrop as HTMLElement);
		fireEvent.click(backdrop as HTMLElement);
		await waitFor(() => expect(close).toHaveBeenCalledOnce());
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
		first.unmount();

		const lockedClose = vi.fn();
		render(
			<DesktopBranchDialog
				{...props({ busy: "checkout", onClose: lockedClose })}
			/>,
		);
		fireEvent.keyDown(document, { key: "Escape" });
		await Promise.resolve();
		expect(lockedClose).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "Close branch dialog" }),
		).toBeDisabled();
	});
});
