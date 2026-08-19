import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	ensureProjectDirectory: vi.fn(async () => undefined),
	openSearch: vi.fn(),
	refreshProjectExplorer: vi.fn(async () => undefined),
	tryOpenEditorSurface: vi.fn(() => true),
	treeProps: null as null | {
		onActivate: (path: string) => void;
	},
}));

const entry = {
	relativePath: "src/index.ts",
	type: "file" as const,
	gitStatus: undefined,
};
const snapshot = {
	entries: [entry],
	entryByPath: new Map([[entry.relativePath, entry]]),
	directories: new Map([
		[
			"",
			{
				status: "ready" as const,
				childPaths: [entry.relativePath],
				error: null,
			},
		],
	]),
	revision: 1,
};

vi.mock("bridge/dialog", () => ({ default: {} }));
vi.mock("bridge/native", () => ({ default: {} }));
vi.mock("lib/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("state/connection", () => ({
	getConnectionSnapshot: () => ({ transport: "local" }),
	getHostInfo: () => ({ id: "local" }),
}));
vi.mock("state/filesystem", () => ({
	createDir: vi.fn(),
	deleteEntry: vi.fn(),
	renameEntry: vi.fn(),
	searchProjectFiles: vi.fn(),
	writeFile: vi.fn(),
}));
vi.mock("./openers", () => ({
	tryOpenEditorSurface: mocks.tryOpenEditorSurface,
}));
vi.mock("./projectTreeGitStatus", () => ({
	deriveProjectTreeGitStatus: () => new Map(),
}));
vi.mock("./projectTreeWorkspace", () => ({
	applyProjectTreeMutation: vi.fn(),
	ensureProjectDirectory: mocks.ensureProjectDirectory,
	getProjectTreeSnapshot: () => snapshot,
	hydrateProjectTreeSearchResults: vi.fn(),
	refreshProjectDirectory: vi.fn(),
	refreshProjectExplorer: mocks.refreshProjectExplorer,
	subscribeProjectTree: () => () => {},
}));
vi.mock("./ShellularFileTree", () => ({
	default: (props: {
		onActivate: (path: string) => void;
		onModel?: (model: { openSearch: () => void }) => void;
	}) => {
		mocks.treeProps = props;
		props.onModel?.({ openSearch: mocks.openSearch });
		return (
			<button type="button" onClick={() => props.onActivate("src/index.ts")}>
				Open index.ts
			</button>
		);
	},
}));

import ProjectExplorerTree from "./ProjectExplorerTree";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.treeProps = null;
});

afterEach(cleanup);

describe("ProjectExplorerTree sidebar integration", () => {
	it("opens an initial search request and reports main-editor navigation", () => {
		const onNavigate = vi.fn();
		render(
			<ProjectExplorerTree
				project={{ path: "/repo", name: "Repo", addedAt: 1 }}
				refreshToken={0}
				searchToken={4}
				onNavigate={onNavigate}
			/>,
		);

		expect(mocks.openSearch).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole("button", { name: "Open index.ts" }));
		expect(mocks.tryOpenEditorSurface).toHaveBeenCalledWith(
			expect.objectContaining({ filePath: "/repo/src/index.ts" }),
		);
		expect(onNavigate).toHaveBeenCalledOnce();
	});
});
