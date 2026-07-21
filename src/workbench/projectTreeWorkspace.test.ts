import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	loadPage: vi.fn(),
}));

vi.mock("state/connection", () => ({
	getHostInfo: () => ({ id: "test-host" }),
}));
vi.mock("state/filesystem", () => ({
	loadProjectTreePage: mocks.loadPage,
}));

import {
	applyProjectTreeMutation,
	ensureProjectTree,
	getProjectTreeSnapshot,
	resetProjectTreeWorkspace,
} from "./projectTreeWorkspace";

beforeEach(() => {
	mocks.loadPage.mockReset();
	resetProjectTreeWorkspace();
});

describe("project tree workspace", () => {
	it("deduplicates mounted consumers and caches a completed tree", async () => {
		mocks.loadPage.mockResolvedValue({
			snapshotId: "one",
			entries: [{ relativePath: "README.md", type: "file" }],
		});

		const first = ensureProjectTree("/work/project");
		const second = ensureProjectTree("/work/project");
		await Promise.all([first, second]);
		await ensureProjectTree("/work/project");

		expect(mocks.loadPage).toHaveBeenCalledTimes(1);
		expect(getProjectTreeSnapshot("/work/project")).toMatchObject({
			loading: false,
			error: null,
			entries: [{ relativePath: "README.md", type: "file" }],
		});
	});

	it("restarts a paged scan once when its snapshot expires", async () => {
		mocks.loadPage
			.mockResolvedValueOnce({
				snapshotId: "expired",
				entries: [{ relativePath: "old.ts", type: "file" }],
				nextCursor: 1,
			})
			.mockRejectedValueOnce(new Error("Project tree snapshot expired"))
			.mockResolvedValueOnce({
				snapshotId: "fresh",
				entries: [{ relativePath: "fresh.ts", type: "file" }],
			});

		await ensureProjectTree("/work/project");

		expect(mocks.loadPage).toHaveBeenCalledTimes(3);
		expect(mocks.loadPage.mock.calls[2][0]).toMatchObject({ refresh: true });
		expect(getProjectTreeSnapshot("/work/project").entries).toEqual([
			{ relativePath: "fresh.ts", type: "file" },
		]);
	});

	it("applies successful add, move, and recursive remove mutations", async () => {
		mocks.loadPage.mockResolvedValue({
			snapshotId: "one",
			entries: [
				{ relativePath: "src", type: "directory" },
				{ relativePath: "src/main.ts", type: "file" },
				{ relativePath: "README.md", type: "file" },
			],
		});
		await ensureProjectTree("/work/project");

		applyProjectTreeMutation("/work/project", {
			type: "add",
			path: "src/file2.ts",
			entryType: "file",
		});
		applyProjectTreeMutation("/work/project", {
			type: "move",
			fromPath: "src",
			toPath: "source",
			entryType: "directory",
		});
		expect(
			getProjectTreeSnapshot("/work/project").entries.map(
				(entry) => entry.relativePath,
			),
		).toEqual(["source", "source/file2.ts", "source/main.ts", "README.md"]);

		applyProjectTreeMutation("/work/project", {
			type: "remove",
			path: "source",
			entryType: "directory",
		});
		expect(getProjectTreeSnapshot("/work/project").entries).toEqual([
			{ relativePath: "README.md", type: "file" },
		]);
	});

	it("normalizes duplicate pages and rejects unsafe or conflicting paths", async () => {
		mocks.loadPage.mockResolvedValueOnce({
			snapshotId: "one",
			entries: [
				{ relativePath: "src\\main.ts", type: "file" },
				{ relativePath: "src/main.ts", type: "file" },
			],
		});
		await ensureProjectTree("/work/project");
		expect(getProjectTreeSnapshot("/work/project").entries).toEqual([
			{ relativePath: "src/main.ts", type: "file" },
		]);

		mocks.loadPage.mockResolvedValueOnce({
			snapshotId: "two",
			entries: [{ relativePath: "../outside", type: "file" }],
		});
		await ensureProjectTree("/work/project", true);
		expect(getProjectTreeSnapshot("/work/project")).toMatchObject({
			entries: [{ relativePath: "src/main.ts", type: "file" }],
			error: 'Invalid project tree path: "../outside"',
		});
	});
});
