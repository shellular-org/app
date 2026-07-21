import type { GitWorkingTreeFile } from "state";
import { describe, expect, it } from "vitest";
import { buildGitTree, collectGitTreeFiles } from "./gitTree";

function file(path: string): GitWorkingTreeFile {
	return {
		path,
		status: "modified",
		indexStatus: ".",
		worktreeStatus: "M",
		staged: false,
		unstaged: true,
		untracked: false,
	};
}

describe("Git tree presentation", () => {
	it("groups nested paths and keeps descendant file actions deterministic", () => {
		const tree = buildGitTree([
			file("src/z.ts"),
			file("README.md"),
			file("src/components/a.tsx"),
		]);

		expect(tree.map((node) => node.name)).toEqual(["src", "README.md"]);
		expect(collectGitTreeFiles(tree[0]).map((entry) => entry.path)).toEqual([
			"src/components/a.tsx",
			"src/z.ts",
		]);
	});
});
