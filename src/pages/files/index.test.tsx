import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listDir: vi.fn(async () => [
		{
			name: "notes.ts",
			type: "file" as const,
			size: 12,
			modified: 1,
		},
	]),
	searchProjectFiles: vi.fn(async () => ({
		entries: [],
		history: [],
		status: { isScanning: false, scannedFilesCount: 0 },
	})),
	openEditor: vi.fn(() => true),
	closeDialog: vi.fn(),
}));

vi.mock("state", () => ({
	useShellular: () => ({
		connectionStatus: "connected",
		hostDir: "/work",
		listDir: mocks.listDir,
		searchProjectFiles: mocks.searchProjectFiles,
		writeFile: vi.fn(),
		writeFileBinary: vi.fn(),
	}),
}));
vi.mock("lib/settings", () => ({
	SETTINGS_CHANGED_EVENT: "shellular:settings-changed",
	loadSettings: vi.fn(async () => ({ showHiddenFiles: false })),
	saveSettings: vi.fn(async () => undefined),
}));
vi.mock("workbench/openers", () => ({
	tryOpenEditorSurface: mocks.openEditor,
}));
vi.mock("workbench/pageChrome", () => ({
	useIsWorkbenchPageChromeActive: () => false,
}));
vi.mock("workbench/store", () => ({
	closeWorkbenchDialog: mocks.closeDialog,
}));
vi.mock("components/Page", () => ({
	default: ({
		children,
		toolbarSlot,
		footerSlot,
	}: {
		children: ReactNode;
		toolbarSlot?: ReactNode;
		footerSlot?: ReactNode;
	}) => (
		<div>
			{toolbarSlot}
			{children}
			{footerSlot}
		</div>
	),
}));
vi.mock("App", () => ({ pushPage: vi.fn() }));
vi.mock("bridge/dialog", () => ({
	default: { textInput: vi.fn(), confirm: vi.fn() },
}));

import FileBrowserPage from ".";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("embedded project files", () => {
	it("keeps controls available, opens editors in the workbench, and responds to search requests", async () => {
		const onNavigate = vi.fn();
		const view = render(
			<FileBrowserPage
				title="Alpha"
				initialPath="/work/alpha"
				mode="project"
				embedded
				onNavigate={onNavigate}
			/>,
		);

		expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "Search project" }),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Git history" })).toBeVisible();
		expect(screen.getByRole("button", { name: "File actions" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

		fireEvent.click(await screen.findByRole("button", { name: /notes\.ts/ }));
		expect(mocks.openEditor).toHaveBeenCalledWith(
			expect.objectContaining({ filePath: "/work/alpha/notes.ts" }),
		);
		expect(mocks.closeDialog).toHaveBeenCalledOnce();
		expect(onNavigate).toHaveBeenCalledOnce();

		view.rerender(
			<FileBrowserPage
				title="Alpha"
				initialPath="/work/alpha"
				mode="project"
				embedded
				searchRequest={1}
				onNavigate={onNavigate}
			/>,
		);
		await waitFor(() =>
			expect(
				screen.getByRole("searchbox", { name: "Search project files" }),
			).toHaveFocus(),
		);
	});
});
