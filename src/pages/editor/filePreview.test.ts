import { describe, expect, it } from "vitest";
import { getFilePreview, isTextFilePath } from "./filePreview";

describe("desktop file preview routing", () => {
	it("keeps source and special extensionless files in Monaco", () => {
		expect(isTextFilePath("/repo/src/app.ts")).toBe(true);
		expect(isTextFilePath("/repo/Dockerfile")).toBe(true);
	});

	it("routes media to safe previews with the correct MIME type", () => {
		expect(getFilePreview("/repo/logo.PNG")).toEqual({
			kind: "image",
			mimeType: "image/png",
		});
		expect(getFilePreview("/repo/demo.mp4")).toEqual({
			kind: "video",
			mimeType: "video/mp4",
		});
	});

	it("never decodes known binary formats as text", () => {
		expect(getFilePreview("/repo/archive.zip")).toEqual({
			kind: "binary",
			label: ".zip binary file",
		});
		expect(isTextFilePath("/repo/data.sqlite")).toBe(false);
	});
});
