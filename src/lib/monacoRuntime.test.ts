import type * as Monaco from "monaco-editor";
import { describe, expect, it } from "vitest";
import { monacoWorkerName, resolveMonacoLanguage } from "./monacoRuntime";

const monaco = {
	languages: {
		getLanguages: () => [
			{ id: "dockerfile", filenames: ["Dockerfile"] },
			{ id: "typescript", extensions: [".ts", ".tsx"] },
			{ id: "python", extensions: [".py"] },
		],
	},
} as unknown as typeof Monaco;

describe("Monaco runtime routing", () => {
	it("maps special filenames and extensions", () => {
		expect(resolveMonacoLanguage(monaco, "/repo/Dockerfile")).toBe(
			"dockerfile",
		);
		expect(resolveMonacoLanguage(monaco, "/repo/App.TSX")).toBe("typescript");
		expect(resolveMonacoLanguage(monaco, "/repo/script.py")).toBe("python");
		expect(resolveMonacoLanguage(monaco, "/repo/NOTICE")).toBe("plaintext");
	});

	it("routes language services to dedicated workers", () => {
		expect(monacoWorkerName("typescript")).toBe("ts");
		expect(monacoWorkerName("json")).toBe("json");
		expect(monacoWorkerName("scss")).toBe("css");
		expect(monacoWorkerName("unknown")).toBe("editor");
	});
});
