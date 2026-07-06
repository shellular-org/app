import { describe, expect, it } from "vitest";
import {
	isRemoteAbsolutePath,
	joinRemotePath,
	normalizeRemoteWorkspacePath,
} from "./remotePath";

describe("normalizeRemoteWorkspacePath", () => {
	it("does not prefix Windows drive paths with the host cwd", () => {
		expect(
			normalizeRemoteWorkspacePath(
				"D:\\Work\\First_EC.VL.CommerceTools",
				"C:\\Users\\biraj-rocks",
			),
		).toBe("D:\\Work\\First_EC.VL.CommerceTools");
		expect(
			normalizeRemoteWorkspacePath(
				"C:\\Users\\biraj-rocks\\Documents\\WORK\\test",
				"C:\\Users\\biraj-rocks",
			),
		).toBe("C:\\Users\\biraj-rocks\\Documents\\WORK\\test");
	});

	it("recognizes Windows drive and UNC paths as absolute remote paths", () => {
		expect(isRemoteAbsolutePath("D:\\Work\\First_EC.VL.CommerceTools")).toBe(
			true,
		);
		expect(
			isRemoteAbsolutePath("C:/Users/biraj-rocks/Documents/WORK/test"),
		).toBe(true);
		expect(isRemoteAbsolutePath("\\\\server\\share\\repo")).toBe(true);
	});

	it("joins relative Windows paths using the host path style", () => {
		expect(
			normalizeRemoteWorkspacePath(
				"Documents\\WORK\\test",
				"C:\\Users\\biraj-rocks",
			),
		).toBe("C:\\Users\\biraj-rocks\\Documents\\WORK\\test");
		expect(
			normalizeRemoteWorkspacePath("..\\repo", "C:\\Users\\biraj-rocks"),
		).toBe("C:\\Users\\repo");
	});

	it("keeps existing POSIX normalization behavior", () => {
		expect(normalizeRemoteWorkspacePath("../repo", "/Users/ajit")).toBe(
			"/Users/repo",
		);
		expect(
			normalizeRemoteWorkspacePath("./src//pages", "/Users/ajit/app"),
		).toBe("/Users/ajit/app/src/pages");
		expect(
			normalizeRemoteWorkspacePath("src\\main.ts", "/Users/ajit/app"),
		).toBe("/Users/ajit/app/src/main.ts");
	});
});

describe("joinRemotePath", () => {
	it("does not fuse an absolute cross-drive child onto the base", () => {
		// The core Windows bug: navigating/building under a D: project while the
		// host base is on C: must not produce `C:\Users\me\D:\proj`.
		expect(joinRemotePath("C:\\Users\\me", "D:\\proj")).toBe("D:\\proj");
		expect(joinRemotePath("C:\\Users\\me", "D:/proj")).toBe("D:/proj");
		expect(joinRemotePath("/Users/me", "/srv/other")).toBe("/srv/other");
		expect(joinRemotePath("C:\\Users\\me", "\\\\server\\share")).toBe(
			"\\\\server\\share",
		);
	});

	it("joins relative children using the base path style", () => {
		expect(joinRemotePath("D:\\Work\\proj", "src")).toBe("D:\\Work\\proj\\src");
		expect(joinRemotePath("D:\\Work\\proj\\", "src")).toBe(
			"D:\\Work\\proj\\src",
		);
		expect(joinRemotePath("/Users/me/app", "src")).toBe("/Users/me/app/src");
		expect(joinRemotePath("/Users/me/app/", "./src")).toBe("/Users/me/app/src");
	});

	it("returns the base when the child is empty", () => {
		expect(joinRemotePath("D:\\Work\\proj", "")).toBe("D:\\Work\\proj");
	});
});
