import native from "bridge/native";
import type * as Monaco from "monaco-editor";
import themes from "themes";
import { installMonacoClipboardAdapter } from "./monacoClipboard";
import { createMonacoTheme, monacoThemeName } from "./monacoTheme";

type MonacoEnvironment = {
	getWorker?: (moduleId: string, label: string) => Worker;
	getWorkerUrl?: (moduleId: string, label: string) => string;
	globalAPI?: boolean;
};

const workerNames: Record<string, string> = {
	json: "json",
	css: "css",
	scss: "css",
	less: "css",
	html: "html",
	handlebars: "html",
	razor: "html",
	typescript: "ts",
	javascript: "ts",
	editorWorkerService: "editor",
};

export function monacoWorkerName(label: string) {
	return workerNames[label] ?? "editor";
}

let runtimePromise: Promise<typeof Monaco> | null = null;
let macWorkerUrls: Record<string, string> | null = null;
let subscribed = false;

async function prepareMacWorkers() {
	if (!process.env.IS_MACOS || macWorkerUrls) return;
	const entries = await Promise.all(
		["editor", "json", "css", "html", "ts"].map(async (name) => {
			const path = `monaco/${name}.worker.js`;
			let source: string;
			try {
				const response = await fetch(new URL(path, document.baseURI));
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				source = await response.text();
			} catch {
				// Some WKWebView versions reject Fetch for custom schemes. The
				// trusted native bundle reader is a bounded fallback for those hosts.
				source = await native.loadBundledAsset(path);
			}
			if (!source.trim())
				throw new Error(`Monaco ${name} worker is unavailable`);
			return [
				name,
				URL.createObjectURL(
					new Blob([source], { type: "application/javascript" }),
				),
			] as const;
		}),
	);
	macWorkerUrls = Object.fromEntries(entries);
}

async function checkWorkerHealth(monaco: typeof Monaco) {
	const worker = monaco.createWebWorker({
		moduleId: "vs/editor/editor.worker",
		label: "editorWorkerService",
		createData: null,
	});
	let timeout = 0;
	try {
		await Promise.race([
			worker.getProxy(),
			new Promise<never>((_, reject) => {
				timeout = window.setTimeout(
					() => reject(new Error("Monaco editor worker did not start")),
					4_000,
				);
			}),
		]);
	} finally {
		window.clearTimeout(timeout);
		worker.dispose();
	}
}

function installMacWorkerFactory() {
	if (!process.env.IS_MACOS || !macWorkerUrls) return;
	const target = globalThis as typeof globalThis & {
		MonacoEnvironment?: MonacoEnvironment;
	};
	target.MonacoEnvironment = {
		...target.MonacoEnvironment,
		getWorker(_moduleId, label) {
			const name = monacoWorkerName(label);
			const url = macWorkerUrls?.[name];
			if (!url) throw new Error(`Monaco worker ${name} was not prepared`);
			return new Worker(url);
		},
	};
}

function applyTheme(monaco: typeof Monaco) {
	const theme = themes.current;
	if (!theme) return;
	const name = monacoThemeName(theme);
	monaco.editor.defineTheme(name, createMonacoTheme(theme));
	monaco.editor.setTheme(name);
}

export function loadMonaco() {
	if (!runtimePromise) {
		runtimePromise = (async () => {
			if (process.env.IS_MACOS) installMonacoClipboardAdapter();
			await prepareMacWorkers();
			installMacWorkerFactory();
			const monaco = await import("monaco-editor");
			installMacWorkerFactory();
			await checkWorkerHealth(monaco);
			applyTheme(monaco);
			if (!subscribed) {
				subscribed = true;
				themes.subscribe(() => applyTheme(monaco));
			}
			return monaco;
		})().catch((error) => {
			runtimePromise = null;
			throw error;
		});
	}
	return runtimePromise;
}

export function resolveMonacoLanguage(monaco: typeof Monaco, path: string) {
	const name = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
	const dot = name.lastIndexOf(".");
	const extension = dot >= 0 ? name.slice(dot) : "";
	for (const language of monaco.languages.getLanguages()) {
		if (
			language.filenames?.some((candidate) => candidate.toLowerCase() === name)
		) {
			return language.id;
		}
		if (extension && language.extensions?.includes(extension))
			return language.id;
	}
	return "plaintext";
}
