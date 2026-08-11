export type FilePreview =
	| { kind: "image" | "video" | "audio"; mimeType: string }
	| { kind: "binary"; label: string }
	| { kind: "text" };

const previewTypes: Record<string, FilePreview> = {
	png: { kind: "image", mimeType: "image/png" },
	jpg: { kind: "image", mimeType: "image/jpeg" },
	jpeg: { kind: "image", mimeType: "image/jpeg" },
	gif: { kind: "image", mimeType: "image/gif" },
	webp: { kind: "image", mimeType: "image/webp" },
	bmp: { kind: "image", mimeType: "image/bmp" },
	ico: { kind: "image", mimeType: "image/x-icon" },
	avif: { kind: "image", mimeType: "image/avif" },
	heic: { kind: "image", mimeType: "image/heic" },
	heif: { kind: "image", mimeType: "image/heic" },
	tif: { kind: "image", mimeType: "image/tiff" },
	tiff: { kind: "image", mimeType: "image/tiff" },
	mp4: { kind: "video", mimeType: "video/mp4" },
	webm: { kind: "video", mimeType: "video/webm" },
	ogv: { kind: "video", mimeType: "video/ogg" },
	mov: { kind: "video", mimeType: "video/quicktime" },
	m4v: { kind: "video", mimeType: "video/x-m4v" },
	mp3: { kind: "audio", mimeType: "audio/mpeg" },
	wav: { kind: "audio", mimeType: "audio/wav" },
	ogg: { kind: "audio", mimeType: "audio/ogg" },
	oga: { kind: "audio", mimeType: "audio/ogg" },
	m4a: { kind: "audio", mimeType: "audio/mp4" },
	aac: { kind: "audio", mimeType: "audio/aac" },
	flac: { kind: "audio", mimeType: "audio/flac" },
	opus: { kind: "audio", mimeType: "audio/opus" },
	weba: { kind: "audio", mimeType: "audio/webm" },
};

const binaryExtensions = new Set([
	"pdf",
	"zip",
	"tar",
	"gz",
	"bz2",
	"xz",
	"7z",
	"rar",
	"tgz",
	"jar",
	"war",
	"dmg",
	"iso",
	"exe",
	"dll",
	"so",
	"dylib",
	"bin",
	"dat",
	"o",
	"a",
	"class",
	"pyc",
	"wasm",
	"sqlite",
	"db",
	"ttf",
	"otf",
	"woff",
	"woff2",
	"doc",
	"docx",
	"xls",
	"xlsx",
	"ppt",
	"pptx",
	"psd",
]);

function extension(path: string) {
	const name = path.split("/").pop() ?? path;
	const dot = name.lastIndexOf(".");
	return dot > 0 && dot < name.length - 1
		? name.slice(dot + 1).toLowerCase()
		: "";
}

export function getFilePreview(path: string): FilePreview {
	const ext = extension(path);
	if (previewTypes[ext]) return previewTypes[ext];
	if (binaryExtensions.has(ext)) {
		return {
			kind: "binary",
			label: ext === "pdf" ? ".pdf document" : `.${ext} binary file`,
		};
	}
	return { kind: "text" };
}

export function isTextFilePath(path: string) {
	return getFilePreview(path).kind === "text";
}
