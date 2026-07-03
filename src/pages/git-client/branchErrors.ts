import type { GitBranch } from "state";

export interface BranchActionError {
	title: string;
	message: string;
	branch?: GitBranch;
	canForceDelete: boolean;
}

export function getBranchActionError(
	error: unknown,
	fallback: string,
	branch?: GitBranch,
): BranchActionError {
	const raw =
		error instanceof Error ? error.message : String(error || fallback);
	const notMerged = /not fully merged/i.test(raw);
	if (notMerged && branch) {
		return {
			title: "Branch isn't fully merged",
			message: `“${branch.name}” contains commits that may not exist on another branch. Force deleting it can permanently remove that work.`,
			branch,
			canForceDelete: true,
		};
	}

	const gitError =
		raw.match(/error:\s*(.*?)(?:\s+hint:|$)/i)?.[1]?.trim() ||
		raw.replace(/^Command failed:\s*[^\n]+/i, "").trim() ||
		fallback;
	return {
		title: fallback,
		message: gitError,
		branch,
		canForceDelete: false,
	};
}
