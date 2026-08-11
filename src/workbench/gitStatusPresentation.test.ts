import type { GitFileStatus } from "state";
import { describe, expect, it } from "vitest";
import {
	getGitStatusPresentation,
	TREE_GIT_STATUS_STYLE,
} from "./gitStatusPresentation";

describe("Git status presentation", () => {
	it.each<[GitFileStatus, string, string | null, string]>([
		["added", "added", "A", "var(--success)"],
		["untracked", "untracked", "U", "var(--success)"],
		["modified", "modified", "M", "var(--warning)"],
		["staged", "modified", "M", "var(--warning)"],
		["deleted", "deleted", "D", "var(--danger)"],
		["renamed", "renamed", "R", "var(--info)"],
		["ignored", "ignored", null, "var(--secondary-text)"],
	])("maps %s to the Trees presentation", (input, status, label, color) => {
		expect(getGitStatusPresentation(input)).toMatchObject({
			status,
			label,
			color,
		});
	});

	it("uses the same semantic colors for the Trees adapter", () => {
		expect(TREE_GIT_STATUS_STYLE).toMatchObject({
			"--trees-git-added-color-override": "var(--success)",
			"--trees-git-untracked-color-override": "var(--success)",
			"--trees-git-modified-color-override": "var(--warning)",
			"--trees-git-deleted-color-override": "var(--danger)",
			"--trees-git-renamed-color-override": "var(--info)",
			"--trees-git-ignored-color-override": "var(--secondary-text)",
		});
	});
});
