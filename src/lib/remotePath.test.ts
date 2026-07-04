import { describe, expect, it } from "vitest";
import {
	isRemoteAbsolutePath,
	normalizeRemoteWorkspacePath,
} from "./remotePath";

describe("normalizeRemoteWorkspacePath", () => {
	it("does not prefix Windows drive paths with the host cwd", () => {
		expect(
			normalizeRemoteWorkspacePath(
				"D:\\Work\\First_EC.VL.CommerceTools",
				"C:\\Users\\vitavdas",
			),
		).toBe("D:\\Work\\First_EC.VL.CommerceTools");
		expect(
			normalizeRemoteWorkspacePath(
				"C:\\Users\\vitavdas\\Documents\\WORK\\test",
				"C:\\Users\\vitavdas",
			),
		).toBe("C:\\Users\\vitavdas\\Documents\\WORK\\test");
	});

	it("recognizes Windows drive and UNC paths as absolute remote paths", () => {
		expect(isRemoteAbsolutePath("D:\\Work\\First_EC.VL.CommerceTools")).toBe(
			true,
		);
		expect(isRemoteAbsolutePath("C:/Users/vitavdas/Documents/WORK/test")).toBe(
			true,
		);
		expect(isRemoteAbsolutePath("\\\\server\\share\\repo")).toBe(true);
	});

	it("joins relative Windows paths using the host path style", () => {
		expect(
			normalizeRemoteWorkspacePath(
				"Documents\\WORK\\test",
				"C:\\Users\\vitavdas",
			),
		).toBe("C:\\Users\\vitavdas\\Documents\\WORK\\test");
		expect(
			normalizeRemoteWorkspacePath("..\\repo", "C:\\Users\\vitavdas"),
		).toBe("C:\\Users\\repo");
	});

	it("keeps existing POSIX normalization behavior", () => {
		expect(normalizeRemoteWorkspacePath("../repo", "/Users/ajit")).toBe(
			"/Users/repo",
		);
		expect(
			normalizeRemoteWorkspacePath("./src//pages", "/Users/ajit/app"),
		).toBe("/Users/ajit/app/src/pages");
		expect(normalizeRemoteWorkspacePath("src\\main.ts", "/Users/ajit/app")).toBe(
			"/Users/ajit/app/src/main.ts",
		);
	});
});
