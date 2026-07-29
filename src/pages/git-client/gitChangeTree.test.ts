import type { GitWorkingTreeFile } from "state";
import { describe, expect, it } from "vitest";
import { buildGitChangeTree } from "./gitChangeTree";

function changedFile(path: string): GitWorkingTreeFile {
	return {
		path,
		indexStatus: " ",
		worktreeStatus: "M",
		status: "modified",
		staged: false,
		unstaged: true,
		untracked: false,
	};
}

describe("buildGitChangeTree", () => {
	it("groups files by directory and sorts folders before files", () => {
		const tree = buildGitChangeTree([
			changedFile("README.md"),
			changedFile("src/zeta.ts"),
			changedFile("src/alpha.ts"),
			changedFile("assets/logo.svg"),
		]);

		expect(tree.map((node) => node.name)).toEqual([
			"assets",
			"src",
			"README.md",
		]);
		expect(tree[1]).toMatchObject({
			type: "directory",
			name: "src",
			path: "src",
			fileCount: 2,
		});
		if (tree[1].type === "directory") {
			expect(tree[1].children.map((node) => node.name)).toEqual([
				"alpha.ts",
				"zeta.ts",
			]);
		}
	});

	it("flattens single-child directory chains for a compact mobile tree", () => {
		const tree = buildGitChangeTree([
			changedFile("src/features/profile/components/Avatar.tsx"),
			changedFile("src/features/profile/components/Profile.tsx"),
		]);

		expect(tree).toHaveLength(1);
		expect(tree[0]).toMatchObject({
			type: "directory",
			name: "src / features / profile / components",
			path: "src/features/profile/components",
			fileCount: 2,
		});
	});

	it("handles Windows-style separators without changing operation paths", () => {
		const file = changedFile("src\\pages\\Home.tsx");
		const tree = buildGitChangeTree([file]);

		expect(tree[0]).toMatchObject({
			type: "directory",
			name: "src / pages",
			path: "src/pages",
		});
		if (tree[0].type === "directory") {
			expect(tree[0].children[0]).toMatchObject({
				type: "file",
				name: "Home.tsx",
				path: "src\\pages\\Home.tsx",
				file,
			});
		}
	});
});
