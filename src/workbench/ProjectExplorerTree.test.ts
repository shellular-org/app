import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createDir: vi.fn(),
	message: vi.fn(),
	textInput: vi.fn(),
	writeFile: vi.fn(),
}));

vi.mock("bridge/dialog", () => ({
	default: {
		message: mocks.message,
		textInput: mocks.textInput,
	},
}));

vi.mock("state/filesystem", () => ({
	createDir: mocks.createDir,
	deleteEntry: vi.fn(),
	renameEntry: vi.fn(),
	searchProjectFiles: vi.fn(),
	writeFile: mocks.writeFile,
}));

import { createProjectChild } from "./ProjectExplorerTree";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createProjectChild", () => {
	it("uses a supplied filename without opening a second dialog", async () => {
		const onChanged = vi.fn();

		await expect(
			createProjectChild("/work/alpha", "file", onChanged, "index.ts"),
		).resolves.toEqual({
			type: "add",
			path: "/work/alpha/index.ts",
			entryType: "file",
		});
		expect(mocks.textInput).not.toHaveBeenCalled();
		expect(mocks.writeFile).toHaveBeenCalledWith("/work/alpha/index.ts", "");
		expect(onChanged).toHaveBeenCalledWith({
			type: "add",
			path: "/work/alpha/index.ts",
			entryType: "file",
		});
	});

	it("validates supplied filenames before writing", async () => {
		await expect(
			createProjectChild("/work/alpha", "file", undefined, "bad/name"),
		).resolves.toBeNull();
		expect(mocks.writeFile).not.toHaveBeenCalled();
		expect(mocks.message).toHaveBeenCalledWith(
			"Use a single valid name without path separators.",
			"Invalid Name",
		);
	});
});
