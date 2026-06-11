import opfs from "platforms/browser/lib/opfs";

export default {
	async init() {
		await opfs.init();
	},
	async read(callback: Callback, [path]: [string]) {
		try {
			callback.success(await opfs.readFile(path));
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	/**
	 * Write data to a file
	 * @param {any} callback
	 * @param {[string, ArrayBuffer]} param1
	 */
	async write(callback: Callback, [path, data]: [string, ArrayBuffer]) {
		try {
			await opfs.writeFile(path, data);
			callback.success();
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async delete(callback: Callback, [path, recursive]: [string, boolean]) {
		try {
			await opfs.delete(path, recursive);
			callback.success();
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async exists(callback: Callback, [path]: [string]) {
		try {
			callback.success(await opfs.exists(path));
		} catch (error) {
			console.error("Error checking file existence:", error);
			callback.success(false);
		}
	},
	async move(callback: Callback, [from, to]: [string, string]) {
		try {
			await opfs.move(from, to);
			callback.success();
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async copy(callback: Callback, [from, to]: [string, string]) {
		try {
			await opfs.copy(from, to);
			callback.success();
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async list(callback: Callback, [path]: [string]) {
		try {
			callback.success(await opfs.list(path));
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async isDirectory(callback: Callback, [path]: [string]) {
		try {
			callback.success(await opfs.isDirectory(path));
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async isFile(callback: Callback, [path]: [string]) {
		try {
			callback.success(!(await opfs.isDirectory(path)));
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async createDirectory(callback: Callback, [path]: [string]) {
		try {
			await opfs.getDirectoryHandle(path, { create: true });
			callback.success("Directory created successfully!");
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async createFile(callback: Callback, [path]: [string]) {
		try {
			await opfs.getFileHandle(path, { create: true });
			callback.success();
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async saveToDevice(
		callback: Callback,
		[path, name, notificationTitle, notificationBody]: [
			string,
			string,
			string,
			string,
		],
	) {
		try {
			const data = await opfs.readFile(path);
			const mimeType = getContentType(name);
			const blob = new Blob([data], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const a = Object.assign(document.createElement("a"), {
				href: url,
				download: name,
				title: "Download",
			});
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				document.body.removeChild(a);
				window.URL.revokeObjectURL(url);
			}, 0);
			if (notificationTitle) {
				new Notification(notificationTitle, {
					body: notificationBody || "",
					silent: true,
				});
			}
			callback.success(path);
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async getMetadata(callback: Callback, [path]: [string]) {
		try {
			const stat = await opfs.stat(path);
			callback.success({
				path,
				size: stat.size,
				lastModified: stat.mtime,
				name: path.split("/").pop(),
				isDirectory: stat.isDirectory,
			});
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	resolve(callback: Callback, [path]: [string]) {
		callback.success(path);
	},
	async toUrl(callback: Callback, [path]: [string]) {
		if (path.startsWith("/")) {
			path = path.substring(1);
		}

		if (path.startsWith("cache/")) {
			callback.success(
				`https://${location.host}/__cache__${path.replace(/^cache/, "")}`,
			);
			return;
		}

		if (path.startsWith("files/")) {
			callback.success(
				`https://${location.host}/__file__${path.replace(/^files/, "")}`,
			);
			return;
		}

		callback.error("Cannot convert to url, must be a file created by the app");
	},
	async download(callback: Callback, [url, path]: [string, string]) {
		try {
			const res = await fetch(url);
			if (!res.ok) {
				const error = await res.text();
				callback.error(error);
				throw new Error("Failed to download");
			}

			const contentDisposition = res.headers
				.get("content-disposition")
				?.split("filename=")[1];
			const filename =
				contentDisposition?.replace(/"/g, "") || path.split("/").pop();
			if (!filename) {
				throw new Error("Unable to determine download filename");
			}
			const dest = `${path}/${filename.replace(/"/g, "")}`;

			if (!(await opfs.exists(path))) {
				await opfs.getDirectoryHandle(path, { create: true });
			}

			const fileStream = await opfs.createWriteStream(dest);
			if (!res.body) {
				throw new Error("Download response has no body");
			}
			const reader = res.body.getReader();
			const totalSize = Number(res.headers.get("content-length") ?? 0);
			await streamToWriter(
				reader,
				fileStream as unknown as WritableStreamDefaultWriter,
				async (progress) => {
					try {
						const ratio = progress / totalSize;
						callback.keep = ratio <= 1;
						callback.success(ratio);
					} catch (error) {
						callback.keep = false;
						callback.error(errorMessage(error));
					}
				},
			);
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	reveal(callback: Callback, [_path]: [string]) {
		// TODO: implement reveal for browser
		callback.success();
	},
	print(callback: Callback, [_filePath, _options]: [string, unknown]) {
		// TODO: implement print for browser
		callback.success();
	},
};

/**
 * Asynchronously downloads a file by reading from a reader and writing to a writer in chunks.
 * Updates the progress using the provided setProgress callback.
 */
export async function streamToWriter(
	reader: ReadableStreamDefaultReader,
	writer: WritableStreamDefaultWriter,
	setProgress?: (progress: number) => void,
	onComplete?: () => void,
) {
	let progress = 0;
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) {
			writer.close();
			if (typeof onComplete === "function") {
				onComplete();
			}
			break;
		}
		writer.write(chunk.value);
		progress += chunk.value.length;
		if (typeof setProgress === "function") {
			setProgress(progress);
		}
	}
}

function getContentType(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "txt":
			return "text/plain";
		case "html":
			return "text/html";
		case "json":
			return "application/json";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "pdf":
			return "application/pdf";
		default:
			return "application/octet-stream";
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
