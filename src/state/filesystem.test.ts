import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendRequest: vi.fn() }));

vi.mock("./connection", () => ({ sendRequest: mocks.sendRequest }));

import { MsgType } from "@shellular/protocol";
import { listProjectDirectory, searchProjectFiles } from "./filesystem";

beforeEach(() => mocks.sendRequest.mockReset());

describe("project explorer filesystem requests", () => {
	it("uses backwards-compatible lightweight FS_LIST fields", async () => {
		mocks.sendRequest.mockResolvedValue({
			data: {
				entries: [{ name: "src", type: "directory", size: 0, modified: 0 }],
			},
		});
		const controller = new AbortController();
		await expect(
			listProjectDirectory("/work/project", {
				timeoutMs: 15_000,
				signal: controller.signal,
			}),
		).resolves.toEqual([
			{
				name: "src",
				type: "directory",
				size: 0,
				modified: 0,
				gitStatus: undefined,
			},
		]);
		expect(mocks.sendRequest).toHaveBeenCalledWith(
			{
				type: MsgType.FS_LIST,
				data: {
					path: "/work/project",
					showHidden: true,
					includeMetadata: false,
					includeGitStatus: false,
				},
			},
			{ timeoutMs: 15_000, signal: controller.signal },
		);
	});

	it("passes request controls through indexed search", async () => {
		mocks.sendRequest.mockResolvedValue({
			data: {
				entries: [],
				history: [],
				status: { isScanning: false, scannedFilesCount: 0 },
			},
		});
		const controller = new AbortController();
		await searchProjectFiles("/work/project", "main", {
			limit: 200,
			request: { timeoutMs: 15_000, signal: controller.signal },
		});
		expect(mocks.sendRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				type: MsgType.PROJECT_FILE_SEARCH,
				data: expect.objectContaining({ query: "main", limit: 200 }),
			}),
			{ timeoutMs: 15_000, signal: controller.signal },
		);
	});
});
