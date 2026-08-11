import type * as Monaco from "monaco-editor";

type Entry = { model: Monaco.editor.ITextModel; references: number };
const models = new Map<string, Entry>();

export function acquireMonacoModel(
	monaco: typeof Monaco,
	uri: Monaco.Uri,
	value: string,
	language: string,
) {
	const key = uri.toString();
	let entry = models.get(key);
	if (!entry || entry.model.isDisposed()) {
		entry = {
			model: monaco.editor.createModel(value, language, uri),
			references: 0,
		};
		models.set(key, entry);
	} else if (entry.model.getValue() !== value) {
		entry.model.setValue(value);
	}
	entry.references += 1;
	let released = false;
	return {
		model: entry.model,
		release() {
			if (released) return;
			released = true;
			const current = models.get(key);
			if (!current) return;
			current.references -= 1;
			if (current.references <= 0) {
				current.model.dispose();
				models.delete(key);
			}
		},
	};
}

export function monacoModelCount() {
	return models.size;
}

export function isMonacoModelDirty(
	currentVersion: number,
	savedVersion: number,
) {
	return currentVersion !== savedVersion;
}
