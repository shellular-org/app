import type { GitWorkingTreeStatus } from "state";
import { describe, expect, it } from "vitest";
import { deriveProjectTreeGitStatus } from "./projectTreeGitStatus";

describe("project explorer Git decorations", () => {
	it("decorates files and ancestors in one pass and scopes a nested project", () => {
		const status: GitWorkingTreeStatus = {
			hasGit: true,
			root: "/work/repository",
			ahead: 0,
			behind: 0,
			staged: 0,
			unstaged: 2,
			untracked: 0,
			files: [
				changed("packages/app/src/main.ts", "modified"),
				changed("packages/app/src/removed.ts", "deleted"),
				changed("packages/other/index.ts", "added"),
			],
		};
		const decorations = deriveProjectTreeGitStatus(
			status,
			"/work/repository/packages/app",
		);

		expect([...decorations]).toEqual([
			["src/main.ts", "modified"],
			["src", "deleted"],
			["src/removed.ts", "deleted"],
		]);
	});
});

function changed(path: string, status: "modified" | "deleted" | "added") {
	return {
		path,
		indexStatus: " ",
		worktreeStatus: "M",
		status,
		staged: false,
		unstaged: true,
		untracked: false,
	};
}
