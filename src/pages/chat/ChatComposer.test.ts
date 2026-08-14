import { describe, expect, it } from "vitest";
import { readComposerParts } from "./ChatComposer";

describe("readComposerParts", () => {
	it("preserves newlines created by contenteditable block elements", () => {
		const root = document.createElement("div");
		root.innerHTML = "<div>first line</div><div>second line</div>";

		expect(readComposerParts(root)).toEqual([
			{ type: "text", text: "first line\nsecond line" },
		]);
	});
});
