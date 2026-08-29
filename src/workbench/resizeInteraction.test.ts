import { afterEach, describe, expect, it } from "vitest";
import { beginWorkbenchResize } from "./resizeInteraction";

afterEach(() => {
	document.documentElement.classList.remove("workbench-is-resizing");
	document.documentElement.style.removeProperty("--workbench-resize-cursor");
	document.body.replaceChildren();
});

describe("workbench resize interaction", () => {
	it("clears selection and suppresses selection until resizing finishes", () => {
		const input = document.createElement("textarea");
		input.value = "selected text";
		document.body.append(input);
		input.focus();
		input.select();

		const finish = beginWorkbenchResize("col-resize");
		expect(document.activeElement).not.toBe(input);
		expect(document.documentElement).toHaveClass("workbench-is-resizing");
		expect(
			document.documentElement.style.getPropertyValue(
				"--workbench-resize-cursor",
			),
		).toBe("col-resize");

		finish();
		expect(document.documentElement).not.toHaveClass("workbench-is-resizing");
		expect(
			document.documentElement.style.getPropertyValue(
				"--workbench-resize-cursor",
			),
		).toBe("");
	});
});
