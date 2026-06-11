let root: FileSystemDirectoryHandle | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle> {
	if (!root) {
		root = await navigator.storage.getDirectory();
	}
	return root;
}

/**
 * Node.js-like WriteStream wrapper for OPFS
 */
class OPFSWriteStream {
	writable: FileSystemWritableFileStream;
	options: { path?: string };
	closed: boolean;
	destroyed: boolean;
	bytesWritten: number;
	_pending = false;
	listeners: { [event: string]: Array<(...args: unknown[]) => void> };

	constructor(writable: FileSystemWritableFileStream, options = {}) {
		this.writable = writable;
		this.options = options;
		this.closed = false;
		this.destroyed = false;
		this.pending = false;
		this.bytesWritten = 0;

		// Event emitter-like functionality
		this.listeners = {};
	}

	on(event: string, listener: (...args: unknown[]) => void) {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(listener);
		return this;
	}

	once(event: string, listener: (...args: unknown[]) => void) {
		const onceWrapper = (...args: unknown[]) => {
			listener(...args);
			this.off(event, onceWrapper);
		};
		return this.on(event, onceWrapper);
	}

	off(event: string, listener: (...args: unknown[]) => void) {
		if (!this.listeners[event]) return this;
		const index = this.listeners[event].indexOf(listener);
		if (index > -1) {
			this.listeners[event].splice(index, 1);
		}
		return this;
	}

	emit(event: string, ...args: unknown[]) {
		if (this.listeners[event]) {
			this.listeners[event].forEach((listener) => {
				try {
					listener(...args);
				} catch (error) {
					console.error("Error in event listener:", error);
				}
			});
		}
	}

	async write(
		chunk: unknown,
		encoding?: string,
		callback?: (error?: Error) => void,
	) {
		if (this.closed || this.destroyed) {
			const error = new Error("Cannot write after end");
			if (callback) callback(asError(error));
			return false;
		}

		try {
			this.pending = true;

			// Convert chunk to appropriate format
			let data = chunk;
			if (typeof chunk === "string") {
				data = new TextEncoder().encode(chunk);
			}

			// Handle encoding if provided
			if (encoding && encoding !== "utf8") {
				throw new Error(`Encoding ${encoding} not supported`);
			}

			await this.writable.write(data as ArrayBuffer);
			this.bytesWritten +=
				(data as ArrayBuffer).byteLength || (data as string).length || 0;

			this.pending = false;
			this.emit("drain");

			if (callback) callback();
			return true;
		} catch (error) {
			this.pending = false;
			this.emit("error", error);
			if (callback) callback(asError(error));
			return false;
		}
	}

	async end(
		chunk?: unknown,
		encoding?: string,
		callback?: (error?: Error) => void,
	) {
		if (typeof chunk === "function") {
			callback = chunk as (error?: Error) => void;
			chunk = undefined;
		} else if (typeof encoding === "function") {
			callback = encoding as (error?: Error) => void;
			encoding = undefined;
		}

		try {
			if (chunk !== undefined) {
				await this.write(chunk, encoding);
			}

			await this.writable.close();
			this.closed = true;
			this.emit("finish");
			this.emit("close");

			if (callback) callback();
		} catch (error) {
			this.emit("error", error);
			if (callback) callback(asError(error));
		}
	}

	destroy(error?: Error) {
		if (this.destroyed) return this;

		this.destroyed = true;
		this.closed = true;

		try {
			if (this.writable && !this.writable.locked) {
				this.writable.abort();
			}
		} catch (err) {
			console.error("Error aborting writable:", err);
		}

		if (error) {
			this.emit("error", error);
		}
		this.emit("close");

		return this;
	}

	// Getter properties to match Node.js WriteStream
	get path() {
		return this.options.path || null;
	}

	get pending() {
		return this._pending || false;
	}

	set pending(value) {
		this._pending = value;
	}
}

/**
 * Node.js-like ReadStream wrapper for OPFS
 */
export class OPFSReadStream {
	options: { path?: string };
	closed: boolean;
	destroyed: boolean;
	readable: boolean;
	bytesRead: number;
	listeners: { [event: string]: Array<(...args: unknown[]) => void> };
	file: File;

	constructor(
		file: File,
		options: { path?: string; autoClose?: boolean } = {},
	) {
		this.file = file;
		this.options = options;
		this.closed = false;
		this.destroyed = false;
		this.readable = true;
		this.bytesRead = 0;

		// Event emitter-like functionality
		this.listeners = {};

		// Start reading if not paused
		if (!options.autoClose !== false) {
			this._startReading();
		}
	}

	on(event: string, listener: (...args: unknown[]) => void) {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(listener);
		return this;
	}

	once(event: string, listener: (...args: unknown[]) => void) {
		const onceWrapper = (...args: unknown[]) => {
			listener(...args);
			this.off(event, onceWrapper);
		};
		return this.on(event, onceWrapper);
	}

	off(event: string, listener: (...args: unknown[]) => void) {
		if (!this.listeners[event]) return this;
		const index = this.listeners[event].indexOf(listener);
		if (index > -1) {
			this.listeners[event].splice(index, 1);
		}
		return this;
	}

	emit(event: string, ...args: unknown[]) {
		if (this.listeners[event]) {
			this.listeners[event].forEach((listener) => {
				try {
					listener(...args);
				} catch (error) {
					console.error("Error in event listener:", error);
				}
			});
		}
	}

	async _startReading() {
		try {
			this.emit("open");

			const reader = this.file.stream().getReader();

			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					this.readable = false;
					this.emit("end");
					this.emit("close");
					break;
				}

				if (this.destroyed) {
					reader.cancel();
					break;
				}

				this.bytesRead += value.byteLength;
				this.emit("data", window.Buffer ? window.Buffer.from(value) : value);
			}
		} catch (error) {
			this.emit("error", error);
		}
	}

	pause() {
		// OPFS streams don't support pause/resume natively
		// This is a simplified implementation
		this.readable = false;
		return this;
	}

	resume() {
		this.readable = true;
		return this;
	}

	destroy(error?: Error) {
		if (this.destroyed) return this;

		this.destroyed = true;
		this.readable = false;
		this.closed = true;

		if (error) {
			this.emit("error", error);
		}
		this.emit("close");

		return this;
	}

	// Getter properties to match Node.js ReadStream
	get path() {
		return this.options.path || null;
	}
}

export default {
	async init() {
		root = await navigator.storage.getDirectory();
	},
	getRoot() {
		return root;
	},
	/**
	 * Read a file and return its contents as an ArrayBuffer
	 * @param {string} path
	 */
	async readFile(path: string): Promise<ArrayBuffer> {
		const handle = await getFileHandle(path, { create: false });
		const file = await handle.getFile();
		return file.arrayBuffer();
	},
	/**
	 * Write data to a file
	 * @param {string} path
	 * @param {ArrayBuffer} data
	 */
	async writeFile(path: string, data: ArrayBuffer | string) {
		const handle = await getFileHandle(path, { create: true });
		const writable = await handle.createWritable();
		await writable.write(data);
		await writable.close();
	},
	/**
	 * Delete a file or directory
	 * @param {string} path
	 */
	async delete(path: string, recursive = false) {
		if (await isDirectory(path)) {
			const handle = await getDirectoryHandle(path, { create: false });
			await (await getRoot()).removeEntry(handle.name, { recursive });
			return;
		}

		const handle = await getFileHandle(path, { create: false });
		await (await getRoot()).removeEntry(handle.name);
	},
	/**
	 * Check if a file exists
	 */
	async exists(path: string): Promise<boolean> {
		return exists(path);
	},
	/**
	 * Move a file or directory
	 * @param {string} from
	 * @param {string} to
	 */
	async move(from: string, to: string) {
		const data = await this.readFile(from);
		await this.writeFile(to, data);
		await this.delete(from);
	},
	async copy(from: string, to: string) {
		const data = await this.readFile(from);
		await this.writeFile(to, data);
	},
	async isDirectory(path: string) {
		return isDirectory(path);
	},
	async getFileHandle(path: string, options = {}) {
		return getFileHandle(path, options);
	},
	async getDirectoryHandle(path: string, options = {}) {
		return getDirectoryHandle(path, options);
	},
	async stat(path: string) {
		try {
			const handle = await getFileHandle(path, { create: false });
			const file = await handle.getFile();
			return {
				isFile: true,
				size: file.size,
				isDirectory: false,
				mtime: file.lastModified,
				ctime: file.lastModified,
			};
		} catch {
			if (await isDirectory(path)) {
				return {
					isFile: false,
					isDirectory: true,
					size: 0,
					mtime: 0,
					ctime: 0,
				};
			}
			throw new Error(`No such file or directory: ${path}`);
		}
	},
	async list(path: string) {
		const dirHandle = path
			? await getDirectoryHandle(path, { create: false })
			: await getRoot();
		const entries = [];
		for await (const [name] of dirHandle.entries()) {
			entries.push(name);
		}
		return entries;
	},
	async createWriteStream(path: string, options = {}) {
		const handle = await getFileHandle(path, { create: true });
		const writable = await handle.createWritable();

		// Create a Node.js-like write stream wrapper
		return new OPFSWriteStream(writable, { ...options, path });
	},
	async createReadStream(path: string, options = {}) {
		const handle = await getFileHandle(path, { create: false });
		const file = await handle.getFile();

		// Create a Node.js-like read stream wrapper
		return new OPFSReadStream(file, { ...options, path });
	},
};

async function getFileHandle(path: string, options = {}) {
	const segments = path.split("/").filter(Boolean);
	let currentDir = await getRoot();

	for (let i = 0; i < segments.length - 1; i++) {
		currentDir = await currentDir.getDirectoryHandle(segments[i], {
			create: true,
		});
	}

	return currentDir.getFileHandle(segments[segments.length - 1], options);
}

async function getDirectoryHandle(path: string, options = {}) {
	const segments = path.split("/").filter(Boolean);
	let currentDir = await getRoot();

	for (const segment of segments) {
		currentDir = await currentDir.getDirectoryHandle(segment, options);
	}

	return currentDir;
}

async function isDirectory(path: string) {
	if (!(await exists(path))) {
		throw new Error(`No such file or directory: ${path}`);
	}

	try {
		await getDirectoryHandle(path, { create: false });
		return true;
	} catch {
		return false;
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await getFileHandle(path, { create: false });
		return true;
	} catch {
		try {
			await getDirectoryHandle(path, { create: false });
			return true;
		} catch (error) {
			console.error("Error checking directory:", error);
			return false;
		}
	}
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
