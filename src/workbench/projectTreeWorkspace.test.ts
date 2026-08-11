import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listDirectory: vi.fn(),
}));

vi.mock("state/connection", () => ({
	getHostInfo: () => ({ id: "test-host" }),
}));
vi.mock("state/filesystem", async (importOriginal) => ({
	...(await importOriginal<typeof import("state/filesystem")>()),
	listProjectDirectory: mocks.listDirectory,
}));

import {
	applyProjectTreeMutation,
	ensureProjectDirectory,
	getProjectTreeSnapshot,
	hydrateProjectTreeSearchResults,
	refreshProjectDirectory,
	refreshProjectExplorer,
	resetProjectTreeWorkspace,
} from "./projectTreeWorkspace";

beforeEach(() => {
	mocks.listDirectory.mockReset();
	resetProjectTreeWorkspace();
});

describe("lazy project tree workspace", () => {
	it("loads only the root until a directory is explicitly expanded", async () => {
		mocks.listDirectory.mockImplementation(async (path: string) =>
			path.endsWith("/src")
				? [file("main.ts")]
				: [directory("src"), file("README.md"), directory(".git")],
		);

		await ensureProjectDirectory("/work/project");
		expect(mocks.listDirectory).toHaveBeenCalledTimes(1);
		expect(getProjectTreeSnapshot("/work/project").entries).toEqual([
			{ relativePath: "src", type: "directory", gitStatus: undefined },
			{ relativePath: "README.md", type: "file", gitStatus: undefined },
		]);

		await ensureProjectDirectory("/work/project", "src", {
			priority: "user",
		});
		expect(mocks.listDirectory).toHaveBeenCalledTimes(2);
		expect(
			getProjectTreeSnapshot("/work/project").entries.map(
				(entry) => entry.relativePath,
			),
		).toEqual(["src", "src/main.ts", "README.md"]);
	});

	it("deduplicates folder reads and runs at most two globally", async () => {
		const pending = [
			deferred<ReturnType<typeof file>[]>(),
			deferred(),
			deferred(),
		];
		let active = 0;
		let maximum = 0;
		mocks.listDirectory.mockImplementation(() => {
			const request = pending[mocks.listDirectory.mock.calls.length - 1];
			active += 1;
			maximum = Math.max(maximum, active);
			return request.promise.finally(() => {
				active -= 1;
			});
		});

		const first = ensureProjectDirectory("/one");
		const duplicate = ensureProjectDirectory("/one");
		const second = ensureProjectDirectory("/two");
		const third = ensureProjectDirectory("/three");
		await vi.waitFor(() =>
			expect(mocks.listDirectory).toHaveBeenCalledTimes(2),
		);
		expect(maximum).toBe(2);
		pending[0].resolve([]);
		await vi.waitFor(() =>
			expect(mocks.listDirectory).toHaveBeenCalledTimes(3),
		);
		pending[1].resolve([]);
		pending[2].resolve([]);
		await Promise.all([first, duplicate, second, third]);
		expect(maximum).toBe(2);
		expect(first).toBe(duplicate);
	});

	it("preserves loaded children on error and supports a folder retry", async () => {
		mocks.listDirectory
			.mockResolvedValueOnce([directory("src")])
			.mockResolvedValueOnce([file("one.ts")])
			.mockRejectedValueOnce(new Error("Remote read timed out"))
			.mockResolvedValueOnce([file("two.ts")]);
		await ensureProjectDirectory("/work/project");
		await ensureProjectDirectory("/work/project", "src");
		await refreshProjectDirectory("/work/project", "src");

		expect(
			getProjectTreeSnapshot("/work/project").directories.get("src"),
		).toMatchObject({ status: "error", error: "Remote read timed out" });
		expect(
			getProjectTreeSnapshot("/work/project").entryByPath.has("src/one.ts"),
		).toBe(true);

		await refreshProjectDirectory("/work/project", "src");
		expect(
			getProjectTreeSnapshot("/work/project").entries.map(
				(entry) => entry.relativePath,
			),
		).toEqual(["src", "src/two.ts"]);
	});

	it("ignores a stale root response after Refresh Explorer", async () => {
		const stale = deferred<ReturnType<typeof file>[]>();
		mocks.listDirectory
			.mockReturnValueOnce(stale.promise)
			.mockResolvedValueOnce([file("fresh.ts")]);
		const original = ensureProjectDirectory("/work/project");
		await vi.waitFor(() =>
			expect(mocks.listDirectory).toHaveBeenCalledTimes(1),
		);
		const refreshed = refreshProjectExplorer("/work/project");
		await vi.waitFor(() =>
			expect(mocks.listDirectory).toHaveBeenCalledTimes(2),
		);
		stale.resolve([file("stale.ts")]);
		await Promise.all([original, refreshed]);
		expect(
			getProjectTreeSnapshot("/work/project").entryByPath.has("fresh.ts"),
		).toBe(true);
		expect(
			getProjectTreeSnapshot("/work/project").entryByPath.has("stale.ts"),
		).toBe(false);
	});

	it("applies add, move, and recursive remove mutations", async () => {
		mocks.listDirectory
			.mockResolvedValueOnce([directory("src"), file("README.md")])
			.mockResolvedValueOnce([file("main.ts")]);
		await ensureProjectDirectory("/work/project");
		await ensureProjectDirectory("/work/project", "src");
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
			{ relativePath: "README.md", type: "file", gitStatus: undefined },
		]);
	});

	it("hydrates global search matches and their unloaded ancestors", async () => {
		mocks.listDirectory.mockResolvedValue([file("README.md")]);
		await ensureProjectDirectory("/work/project");
		hydrateProjectTreeSearchResults("/work/project", [
			{
				name: "button.tsx",
				path: "/work/project/src/ui/button.tsx",
				relativePath: "src/ui/button.tsx",
				type: "file",
				size: 0,
				modified: 0,
			},
		]);
		expect(
			getProjectTreeSnapshot("/work/project").entries.map(
				(entry) => entry.relativePath,
			),
		).toEqual(["src", "src/ui", "src/ui/button.tsx", "README.md"]);
	});
});

function file(name: string) {
	return { name, type: "file" as const, size: 0, modified: 0 };
}

function directory(name: string) {
	return { name, type: "directory" as const, size: 0, modified: 0 };
}

function deferred<T = ReturnType<typeof file>[]>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
