import { describe, expect, it } from "vitest";
import { shouldUseMonacoEditor } from "./platform";

describe("desktop editor platform selection", () => {
	it("uses Monaco on desktop-class browser and native surfaces", () => {
		expect(shouldUseMonacoEditor(true, false, false)).toBe(true);
		expect(shouldUseMonacoEditor(true, true, false)).toBe(true);
	});

	it("keeps CodeMirror on mobile and touch-only browsers", () => {
		expect(shouldUseMonacoEditor(false, false, false)).toBe(false);
		expect(shouldUseMonacoEditor(true, true, true)).toBe(false);
	});
});
