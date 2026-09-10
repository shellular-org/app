import opfs from "platforms/browser/lib/opfs";
import { afterEach, describe, expect, it, vi } from "vitest";
import fileService from "./file";

vi.mock("platforms/browser/lib/opfs", () => ({
	default: {
		init: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
	},
}));

const writeFile = vi.mocked(opfs.writeFile);

function callback() {
	return {
		success: vi.fn(),
		error: vi.fn(),
	} as unknown as Callback;
}

function writtenBytes(): ArrayBuffer {
	const [path, contents] = writeFile.mock.calls[0];
	expect(path).toBe("/files/report.apk");
	return contents as ArrayBuffer;
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	writeFile.mockReset();
});

describe("browser file write", () => {
	it("decodes the payload when the write is flagged binary", async () => {
		// file.writeBinary() sends bytes as base64 with isBinary set; storing
		// that string as-is is how a binary download came out corrupted.
		const result = callback();
		const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

		await fileService.write(result, [
			"/files/report.apk",
			btoa("PK\u0003\u0004"),
			true,
		]);

		expect(result.success).toHaveBeenCalledTimes(1);
		expect(new Uint8Array(writtenBytes())).toEqual(bytes);
	});

	it("stores text payloads unchanged", async () => {
		const result = callback();

		await fileService.write(result, ["/files/report.apk", "plain text"]);

		expect(result.success).toHaveBeenCalledTimes(1);
		expect(writeFile).toHaveBeenCalledWith("/files/report.apk", "plain text");
	});

	it("reports a failed write to the callback", async () => {
		const result = callback();
		writeFile.mockRejectedValueOnce(new Error("disk full"));

		await fileService.write(result, ["/files/report.apk", "plain text"]);

		expect(result.error).toHaveBeenCalledWith("disk full");
	});
});

describe("browser saveToDevice", () => {
	it("keeps the blob url alive past the download click", async () => {
		vi.useFakeTimers();
		vi.mocked(opfs.readFile).mockResolvedValue(new ArrayBuffer(4));
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		URL.createObjectURL = vi.fn(() => "blob:download");
		URL.revokeObjectURL = vi.fn();

		const result = callback();
		await fileService.saveToDevice(result, [
			"files/report.apk",
			"report.apk",
			"",
			"",
		]);

		expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
		// The url is handed to the download manager after click() returns, so
		// revoking it on the next tick kills the blob mid-handoff.
		vi.advanceTimersByTime(1000);
		expect(URL.revokeObjectURL).not.toHaveBeenCalled();

		vi.advanceTimersByTime(60_000);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
	});
});
