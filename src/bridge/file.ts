import lang from "lang";
import permissions from "lib/permissions";
import bridge from "./bridge";
import native from "./native";

type FileMetaData = {
	name: string;
	path: string;
	size: number;
	lastModified: string;
	isDirectory: boolean;
};

const file = bridge("FileHandler");

export function bytesToBase64(data: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < data.length; i += chunkSize) {
		binary += String.fromCharCode(
			...data.subarray(i, Math.min(i + chunkSize, data.length)),
		);
	}
	return btoa(binary);
}

export default {
	/**
	 * Read a file
	 * @param {string} path
	 * @param {'text'|'arraybuffer'} [type='text'] - The type of data to read. Default is 'text'.
	 * @returns {Promise<string | ArrayBuffer>}
	 */
	async read(
		path: string,
		type: "text" | "arraybuffer" = "text",
	): Promise<string | ArrayBuffer> {
		const raw = await file("read", [path]);

		// iOS bridge returns file contents as base64-encoded strings.
		// Try to decode; fall back to using the raw string if it's not base64.
		if (typeof raw === "string") {
			let bytes: Uint8Array;
			try {
				const decoded = atob(raw);
				bytes = new Uint8Array(decoded.length);
				for (let i = 0; i < decoded.length; i++)
					bytes[i] = decoded.charCodeAt(i);
			} catch {
				// Not base64 — plain text string
				if (type === "text") return raw;
				return new TextEncoder().encode(raw).buffer as ArrayBuffer;
			}
			if (type === "text") return new TextDecoder().decode(bytes);
			return bytes.buffer as ArrayBuffer;
		}
		if (raw instanceof Uint8Array) {
			if (type === "text") return new TextDecoder().decode(raw);
			return raw.buffer as ArrayBuffer;
		}
		if (raw instanceof ArrayBuffer) {
			if (type === "text") return new TextDecoder().decode(raw);
			return raw;
		}

		// Android / legacy format: { isBase64?: boolean; data: unknown }
		const content = raw as { isBase64?: boolean; data: unknown };
		let buffer: ArrayBuffer;
		if (content.isBase64) {
			const bytes = atob(content.data as string);
			const arr = new Uint8Array(bytes.length);
			for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
			buffer = arr.buffer as ArrayBuffer;
		} else {
			buffer = content.data as ArrayBuffer;
		}

		if (type === "text") {
			return new TextDecoder().decode(buffer);
		}

		return buffer;
	},
	/**
	 * Write a file
	 * @param {string} path
	 * @param {string|ArrayBuffer|File} data
	 * @returns
	 */
	async write(path: string, data: string | ArrayBuffer | File | Blob) {
		if (data instanceof File || data instanceof Blob) {
			data = await data.arrayBuffer();
		}
		return file("write", [path, data, data instanceof ArrayBuffer]);
	},
	/**
	 * Write binary data to a file (base64-encoded).
	 * @param {string} path
	 * @param {Uint8Array} data
	 * @returns
	 */
	writeBinary(path: string, data: Uint8Array) {
		return file("write", [path, bytesToBase64(data), true]);
	},
	/**
	 * Delete a file
	 * @param {string} path
	 * @returns
	 */
	delete(path: string, recursive = true) {
		return file("delete", [path, recursive]);
	},
	/**
	 * Check if a file exists
	 * @param {string} path
	 * @returns {Promise<boolean>}
	 */
	exists(path: string): Promise<boolean> {
		return file("exists", [path]) as Promise<boolean>;
	},
	/**
	 * Move a file
	 * @param {string} from
	 * @param {string} to
	 * @returns {Promise<string>} Success message or error message
	 */
	async move(from: string, to: string): Promise<string> {
		return file("move", [from, to]) as Promise<string>;
	},
	/**
	 * Copy a file
	 * @param {string} from
	 * @param {string} to
	 * @returns {Promise<string>} Success message or error message
	 */
	async copy(from: string, to: string): Promise<string> {
		return file("copy", [from, to]) as Promise<string>;
	},
	/**
	 * List files in a directory
	 * @param {string} path
	 * @returns {Promise<string[]>} List of files in the directory
	 */
	list(path: string): Promise<string[]> {
		return file("list", [path]) as Promise<string[]>;
	},
	/**
	 * Check if a path is a directory
	 * @param {string} path
	 * @returns {Promise<boolean>}
	 */
	isDirectory(path: string): Promise<boolean> {
		return file("isDirectory", [path]) as Promise<boolean>;
	},
	/**
	 * Check if a path is a file
	 * @param {string} path
	 * @returns {Promise<boolean>}
	 */
	isFile(path: string): Promise<boolean> {
		return file("isFile", [path]) as Promise<boolean>;
	},
	/**
	 * Create a directory
	 * @param {string} path
	 * @returns {Promise<string>} Success message or error message
	 */
	createDirectory(path: string): Promise<string> {
		return file("createDirectory", [path]) as Promise<string>;
	},
	/**
	 * Create a file
	 * @param {string} path
	 * @returns {Promise<string>} Success message or error message
	 */
	createFile(path: string): Promise<string> {
		return file("createFile", [path]) as Promise<string>;
	},
	/**
	 * Get metadata of a file or directory
	 * @param {string} path
	 * @returns {Promise<FileMetaData>}
	 */
	getMetadata(path: string): Promise<FileMetaData> {
		return file("getMetadata", [path]) as Promise<FileMetaData>;
	},
	/**
	 * Resolves the given path.
	 * @param {string} path - The path to resolve.
	 * @returns {Promise<string>} - The resolved path.
	 */
	resolve(path: string): Promise<string> {
		return file("resolve", [path]) as Promise<string>;
	},
	/**
	 * Converts a path to a URL.
	 * @param {string} path - The path to convert.
	 * @returns {Promise<string>} - The URL.
	 */
	toUrl(path: string): Promise<string> {
		return file("toUrl", [path]) as Promise<string>;
	},
	async saveToDevice(path: string, name: string) {
		await native.requestPermission(permissions.WRITE_EXTERNAL_STORAGE);
		return file("saveToDevice", [
			path,
			name,
			lang.get("fileSaved"),
			lang.get("fileSavedToDownloads", { name }),
		]) as Promise<string>;
	},
	/**
	 * Downloads a file from the specified URL to the given path.
	 *
	 * @param url - The URL of the file to download.
	 * @param path - The local file path where the downloaded file will be saved.
	 * @param open - A flag indicating whether to open the file after download.
	 * @param progressFunction - A callback function to handle progress updates during the download.
	 */
	download(
		url: string,
		path: string,
		open: "none" | "open" | "reveal",
		progressFunction?: (done: number) => void,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			Bridge.exec(
				(number) => {
					if (number === 1) {
						resolve();
					}

					if (progressFunction) {
						progressFunction(number as number);
					}
				},
				(error) => {
					reject(error);
				},
				"FileHandler",
				"download",
				[url, path, open],
			);
		});
	},
	reveal(path: string): Promise<string> {
		return file("reveal", [path]) as Promise<string>;
	},
	print(filePath: string, options: object = {}): Promise<string> {
		return file("print", [filePath, options]) as Promise<string>;
	},
};
