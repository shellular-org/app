import type * as Monaco from "monaco-editor";
import { describe, expect, it, vi } from "vitest";
import {
	acquireMonacoModel,
	isMonacoModelDirty,
	monacoModelCount,
} from "./monacoModels";

function fakeMonaco() {
	const model = {
		value: "",
		disposed: false,
		getValue() {
			return this.value;
		},
		setValue(value: string) {
			this.value = value;
		},
		isDisposed() {
			return this.disposed;
		},
		dispose() {
			this.disposed = true;
		},
	};
	const createModel = vi.fn((value: string) => {
		model.value = value;
		return model;
	});
	return {
		monaco: { editor: { createModel } } as unknown as typeof Monaco,
		model,
		createModel,
	};
}

describe("Monaco model registry", () => {
	it("reuses a URI and disposes it after the final reference", () => {
		const { monaco, model, createModel } = fakeMonaco();
		const uri = {
			toString: () => "shellular-file://host/project/app.ts",
		} as Monaco.Uri;
		const first = acquireMonacoModel(monaco, uri, "one", "typescript");
		const second = acquireMonacoModel(monaco, uri, "two", "typescript");

		expect(createModel).toHaveBeenCalledTimes(1);
		expect(first.model).toBe(second.model);
		expect(model.value).toBe("two");
		expect(monacoModelCount()).toBe(1);
		first.release();
		expect(model.disposed).toBe(false);
		second.release();
		expect(model.disposed).toBe(true);
		expect(monacoModelCount()).toBe(0);
	});

	it("treats undo back to the saved alternative version as clean", () => {
		expect(isMonacoModelDirty(8, 7)).toBe(true);
		expect(isMonacoModelDirty(7, 7)).toBe(false);
	});
});
