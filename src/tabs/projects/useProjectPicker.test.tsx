import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	addProject: vi.fn(),
	message: vi.fn(),
	pickLocalDirectory: vi.fn(),
	pushPage: vi.fn(),
	connection: {
		transport: "remote",
		hostInfo: null as { dir: string } | null,
	},
}));

vi.mock("App", () => ({ pushPage: mocks.pushPage }));
vi.mock("bridge/dialog", () => ({
	default: { message: mocks.message },
}));
vi.mock("bridge/native", () => ({
	default: { pickLocalDirectory: mocks.pickLocalDirectory },
}));
vi.mock("pages/files", () => ({ default: () => null }));
vi.mock("state", () => ({
	useShellular: () => ({ addProject: mocks.addProject }),
}));
vi.mock("state/connection", () => ({
	getConnectionSnapshot: () => mocks.connection,
}));

import useProjectPicker from "./useProjectPicker";

function selectedFolderHandler() {
	const picker = mocks.pushPage.mock.calls[0][1] as ReactElement<{
		onSelectFolder(path: string): Promise<void>;
	}>;
	return picker.props.onSelectFolder;
}

beforeEach(() => {
	vi.clearAllMocks();
	process.env.IS_MACOS = false;
	mocks.connection.transport = "remote";
	mocks.connection.hostInfo = null;
	mocks.addProject.mockResolvedValue(undefined);
});

describe("project picker", () => {
	it("opens the shared folder picker and adds a selected project", async () => {
		const { result } = renderHook(() => useProjectPicker());

		act(() => result.current.openProjectPicker());
		expect(mocks.pushPage).toHaveBeenCalledWith(
			"project-picker",
			expect.anything(),
		);

		await act(() => selectedFolderHandler()("/work/project"));
		expect(mocks.addProject).toHaveBeenCalledWith("/work/project");
		expect(result.current.adding).toBe(false);
	});

	it("rejects the filesystem root", async () => {
		const { result } = renderHook(() => useProjectPicker());
		act(() => result.current.openProjectPicker());

		await act(() => selectedFolderHandler()("/"));
		expect(mocks.addProject).not.toHaveBeenCalled();
		expect(mocks.message).toHaveBeenCalledWith(
			expect.stringContaining("root directory"),
			"Invalid Project",
		);
	});

	it("reports add failures and clears its loading state", async () => {
		mocks.addProject.mockRejectedValue(new Error("permission denied"));
		const { result } = renderHook(() => useProjectPicker());
		act(() => result.current.openProjectPicker());

		await act(() => selectedFolderHandler()("/private/project"));
		expect(mocks.message).toHaveBeenCalledWith(
			"Failed to add project: permission denied",
			"Error Adding Project",
		);
		expect(result.current.adding).toBe(false);
	});

	it("uses the native folder picker for a local macOS host", async () => {
		process.env.IS_MACOS = true;
		mocks.connection.transport = "local";
		mocks.connection.hostInfo = { dir: "/Users/me" };
		mocks.pickLocalDirectory.mockResolvedValue("/Users/me/project");
		const { result } = renderHook(() => useProjectPicker());

		act(() => result.current.openProjectPicker());
		await waitFor(() =>
			expect(mocks.addProject).toHaveBeenCalledWith("/Users/me/project"),
		);

		expect(mocks.pickLocalDirectory).toHaveBeenCalledWith("/Users/me");
		expect(mocks.pushPage).not.toHaveBeenCalled();
	});
});
