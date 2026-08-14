import { describe, expect, it } from "vitest";
import type { GitReviewComment } from "./reviewComments";
import {
	formatGitReviewPrompt,
	getReviewCode,
	normalizeReviewSelection,
	parseGitReviewPrompt,
} from "./reviewComments";

describe("git review comments", () => {
	it("normalizes reversed selections on one side", () => {
		expect(
			normalizeReviewSelection({
				start: 8,
				end: 5,
				side: "additions",
				endSide: "additions",
			}),
		).toEqual({ side: "additions", startLine: 5, endLine: 8 });
	});

	it("anchors cross-side selections to their ending row", () => {
		expect(
			normalizeReviewSelection({
				start: 4,
				end: 7,
				side: "deletions",
				endSide: "additions",
			}),
		).toEqual({ side: "additions", startLine: 7, endLine: 7 });
	});

	it("extracts numbered context and formats an agent-readable prompt", () => {
		const code = getReviewCode("old", "one\ntwo\nthree", {
			side: "additions",
			startLine: 2,
			endLine: 3,
		});
		expect(code).toBe("2: two\n3: three");

		const comments: GitReviewComment[] = [
			{
				id: "review-1",
				path: "src/example.ts",
				side: "additions",
				startLine: 2,
				endLine: 3,
				body: "Handle the empty state here.",
				code,
			},
		];
		const prompt = formatGitReviewPrompt(comments);
		expect(prompt).toContain('<shellular_git_review version="1">');
		expect(parseGitReviewPrompt(`Please fix this.\n\n${prompt}`)).toEqual({
			comments,
			visibleText: "Please fix this.",
		});
	});
});
