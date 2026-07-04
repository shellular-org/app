import {
	isRemoteAbsolutePath,
	normalizeRemoteWorkspacePath,
} from "lib/remotePath";

export interface NormalizedEditorPath {
	path: string;
	line?: number;
	column?: number;
}

export function normalizeEditorPath(
	rawPath: string,
	workspacePath: string,
): NormalizedEditorPath {
	let path = decodeURIComponent(rawPath.trim())
		.replace(/^file:\/\//, "")
		.replace(/^#L(\d+)$/, "");
	let line: number | undefined;
	let column: number | undefined;

	const hashLineMatch = path.match(/^(.*?)#L(\d+)(?:-L\d+)?$/);
	if (hashLineMatch) {
		path = hashLineMatch[1];
		line = Number(hashLineMatch[2]);
	}
	path = path.replace(/\?[^/?]*$/, "");

	const lineMatch = path.match(/^(.*?):(\d+)(?::(\d+))?$/);
	if (lineMatch?.[1]) {
		path = lineMatch[1];
		line = Number(lineMatch[2]);
		column = lineMatch[3] ? Number(lineMatch[3]) : undefined;
	}

	if (workspacePath && !isRemoteAbsolutePath(path) && !path.includes("://")) {
		path = normalizeRemoteWorkspacePath(path, workspacePath);
	}

	return { path, line, column };
}
