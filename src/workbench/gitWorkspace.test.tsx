import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const shellular = vi.hoisted(() => ({
	connectionStatus: "disconnected",
	projects: [{ name: "Alpha", path: "/alpha", gitInfo: { hasGit: true } }],
	runGitOperation: vi.fn(),
}));

vi.mock("state", () => ({ useShellular: () => shellular }));

import { useDesktopGitWorkspace } from "./gitWorkspace";

describe("desktop Git workspace selection", () => {
	it("owns replace, toggle, and range selection within one comparison group", async () => {
		const { result } = renderHook(() => useDesktopGitWorkspace());
		await waitFor(() => expect(result.current.states["/alpha"]).toBeDefined());
		const paths = ["a.ts", "b.ts", "c.ts"];

		act(() =>
			result.current.select(
				"/alpha",
				"index-to-worktree",
				"a.ts",
				paths,
				"replace",
			),
		);
		act(() =>
			result.current.select(
				"/alpha",
				"index-to-worktree",
				"c.ts",
				paths,
				"range",
			),
		);
		expect([...result.current.states["/alpha"].selectedPaths]).toEqual(paths);

		act(() =>
			result.current.select(
				"/alpha",
				"index-to-worktree",
				"b.ts",
				paths,
				"toggle",
			),
		);
		expect([...result.current.states["/alpha"].selectedPaths]).toEqual([
			"a.ts",
			"c.ts",
		]);

		act(() =>
			result.current.select("/alpha", "head-to-index", "b.ts", paths, "toggle"),
		);
		expect(result.current.states["/alpha"].selectionTarget).toBe(
			"head-to-index",
		);
		expect([...result.current.states["/alpha"].selectedPaths]).toEqual([
			"b.ts",
		]);
	});
});
