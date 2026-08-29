import { describe, expect, it } from "vitest";
import { comparisonSurfaceId, createEditorSurface } from "./surfaces";

describe("editor comparison surfaces", () => {
	it("uses source-specific stable IDs", () => {
		const staged = {
			kind: "working-tree" as const,
			projectPath: "/repo",
			relativePath: "src/app.ts",
			target: "head-to-index" as const,
		};
		const unstaged = { ...staged, target: "index-to-worktree" as const };
		expect(comparisonSurfaceId(staged)).not.toBe(comparisonSurfaceId(unstaged));
		expect(
			createEditorSurface({ filePath: "/repo/src/app.ts", comparison: staged })
				.id,
		).toBe("git-diff:/repo:head-to-index:src/app.ts");
	});

	it("marks inline payload surfaces as transient without changing their ID", () => {
		const surface = createEditorSurface({
			filePath: "src/app.ts",
			restorable: false,
			comparison: {
				kind: "inline",
				workspacePath: "/repo",
				relativePath: "src/app.ts",
				sourceId: "message-1:part-2",
				oldText: "old",
				newText: "new",
			},
		});
		expect(surface.id).toBe("agent-diff:message-1:part-2:src/app.ts");
		expect(surface.restorable).toBe(false);
	});
});
