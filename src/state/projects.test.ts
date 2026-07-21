import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("bridge/file", () => ({
	default: {
		exists: vi.fn(async (path: string) => storage.has(path)),
		read: vi.fn(async (path: string) => storage.get(path) ?? "[]"),
		write: vi.fn(async (path: string, value: string) => {
			await Promise.resolve();
			storage.set(path, value);
		}),
	},
}));

vi.mock("lib/appConfig", () => ({
	default: { DATA_DIR: "/data" },
}));

vi.mock("./connection", () => ({
	sendRequest: vi.fn(),
}));

import { addProject, loadProjects, removeProject } from "./projects";

beforeEach(() => storage.clear());

describe("project persistence", () => {
	it("adds folders without replacing existing projects", async () => {
		storage.set(
			"/data/projects-host.json",
			JSON.stringify([{ path: "/work/one", name: "one", addedAt: 1 }]),
		);

		const projects = await addProject("host", "/work/two");
		expect(projects.map(({ path }) => path)).toEqual([
			"/work/one",
			"/work/two",
		]);
		expect((await loadProjects("host"))[0]?.addedAt).toBe(1);
	});

	it("serializes concurrent additions against the latest saved list", async () => {
		const [first, second] = await Promise.all([
			addProject("host", "/work/one"),
			addProject("host", "/work/two"),
		]);

		expect(first.map(({ path }) => path)).toEqual(["/work/one"]);
		expect(second.map(({ path }) => path)).toEqual(["/work/one", "/work/two"]);
		expect((await loadProjects("host")).map(({ path }) => path)).toEqual([
			"/work/one",
			"/work/two",
		]);
	});

	it("normalizes duplicate paths and preserves other projects on removal", async () => {
		await addProject("host", "/work/one/");
		await addProject("host", "/work/one");
		await addProject("host", "\\work\\two\\");

		expect((await loadProjects("host")).map(({ path }) => path)).toEqual([
			"/work/one",
			"/work/two",
		]);
		expect(
			(await removeProject("host", "/work/one/")).map(({ path }) => path),
		).toEqual(["/work/two"]);
	});
});
