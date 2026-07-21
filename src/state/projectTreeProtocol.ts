import { z } from "zod";

export const PROJECT_TREE_MESSAGE = "project:tree";
export const PROJECT_TREE_RESULT_MESSAGE = "project:tree:result";

const GitStatusSchema = z.enum([
	"modified",
	"staged",
	"added",
	"deleted",
	"renamed",
	"untracked",
	"ignored",
]);

export const ProjectTreeResultSchema = z.object({
	id: z.string().optional(),
	type: z.literal(PROJECT_TREE_RESULT_MESSAGE),
	clientId: z.string(),
	respTo: z.string().optional(),
	error: z.string().optional(),
	data: z
		.object({
			path: z.string(),
			snapshotId: z.string(),
			entries: z.array(
				z.object({
					relativePath: z.string(),
					type: z.enum(["directory", "file"]),
					gitStatus: GitStatusSchema.nullable().optional(),
				}),
			),
			nextCursor: z.number().int().nonnegative().optional(),
		})
		.optional(),
});

export type ProjectTreeResult = z.infer<typeof ProjectTreeResultSchema>;

export function parseProjectTreeResult(raw: string): ProjectTreeResult | null {
	try {
		const parsed = ProjectTreeResultSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
