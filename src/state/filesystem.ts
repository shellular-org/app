import {
	type FsListResultMsg,
	type FsReadResultMsg,
	type FsResultMsg,
	type FsWriteResultMsg,
	type GitBranch,
	type GitCommit,
	type GitCommitFile,
	type GitCommitFileDiffResultMsg,
	type GitCommitFilesResultMsg,
	type GitLogResultMsg,
	type GitOperation,
	type GitOperationResultMsg,
	type GitReadResultMsg,
	type GitWorkingTreeFile,
	type GitWorkingTreeFileDiff,
	type GitWorkingTreeStatus,
	MsgType,
	type ProjectFileSearchResultMsg,
} from "@shellular/protocol";
import { sendRequest } from "./connection";

export interface GitLogPage {
	commits: GitCommit[];
	hasMore: boolean;
	total: number;
}

export interface GitCommitFileDiff {
	oldText: string;
	newText: string;
	binary: boolean;
}

export type {
	GitBranch,
	GitOperation,
	GitWorkingTreeFile,
	GitWorkingTreeFileDiff,
	GitWorkingTreeStatus,
};

export type GitFileStatus =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "untracked"
	| "ignored"
	| "staged";

export interface FileEntry {
	name: string;
	type: "file" | "directory";
	size: number;
	modified: number;
	gitStatus?: GitFileStatus;
}

export interface ProjectFileSearchEntry extends FileEntry {
	path: string;
	relativePath: string;
	score?: {
		total: number;
		matchType: string;
		exactMatch: boolean;
		filenameBonus: number;
		frecencyBoost: number;
		comboMatchBoost: number;
	};
}

export interface ProjectFileSearchResult {
	entries: ProjectFileSearchEntry[];
	history: string[];
	status: {
		isScanning: boolean;
		scannedFilesCount: number;
		indexedFiles?: number;
		diagnostics?: {
			nativeAvailable: boolean;
			gitAvailable?: boolean;
			repositoryFound?: boolean;
			issues: string[];
		};
	};
}

function base64ToBytes(content: string): Uint8Array {
	const binary = atob(content);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function isLikelyBinaryBytes(bytes: Uint8Array): boolean {
	const sample = bytes.subarray(0, Math.min(bytes.length, 8000));
	if (sample.length === 0) return false;

	let suspicious = 0;
	for (const byte of sample) {
		if (byte === 0) return true;
		if (byte < 7 || (byte > 13 && byte < 32) || byte === 127) {
			suspicious++;
		}
	}

	try {
		new TextDecoder("utf-8", { fatal: true }).decode(sample);
	} catch {
		return true;
	}

	return suspicious / sample.length > 0.3;
}

function isLikelyBinaryText(content: string): boolean {
	const sample = content.slice(0, 8000);
	if (!sample) return false;
	if (sample.includes("\0") || sample.includes("\uFFFD")) return true;

	let suspicious = 0;
	for (let i = 0; i < sample.length; i++) {
		const code = sample.charCodeAt(i);
		if (code < 7 || (code > 13 && code < 32) || code === 127) {
			suspicious++;
		}
	}

	return suspicious / sample.length > 0.3;
}

function binaryReadError(path: string): Error {
	return new Error(
		`"${path.split("/").pop() || path}" looks like a binary file, so it was not opened in the text editor.`,
	);
}

export async function listDir(
	path: string,
	showHidden?: boolean,
): Promise<FileEntry[]> {
	const res = await sendRequest<FsListResultMsg>({
		type: MsgType.FS_LIST,
		data: { path, showHidden },
	});
	if (res.error) throw new Error(res.error);
	return (res.data?.entries ?? []).map((entry) => ({
		...entry,
		gitStatus: entry.gitStatus ?? undefined,
	}));
}

export async function searchProjectFiles(
	path: string,
	query: string,
	options: {
		limit?: number;
		selectedPath?: string;
		includeHistory?: boolean;
		refresh?: boolean;
	} = {},
): Promise<ProjectFileSearchResult> {
	const res = await sendRequest<ProjectFileSearchResultMsg>({
		type: MsgType.PROJECT_FILE_SEARCH,
		data: {
			path,
			query,
			limit: options.limit,
			selectedPath: options.selectedPath,
			includeHistory: options.includeHistory,
			refresh: options.refresh,
		},
	});
	if (res.error) throw new Error(res.error);
	return {
		entries: (res.data?.entries ?? []).map((entry) => ({
			...entry,
			gitStatus: entry.gitStatus ?? undefined,
		})),
		history: res.data?.history ?? [],
		status: res.data?.status ?? {
			isScanning: false,
			scannedFilesCount: 0,
		},
	};
}

export async function readFile(path: string): Promise<string> {
	const res = await sendRequest<FsReadResultMsg>({
		type: MsgType.FS_READ,
		data: { path },
	});
	if (res.error) throw new Error(res.error);
	if (!res.data) throw new Error("No data received");

	if (res.data.encoding === "base64") {
		if (!res.data.content) throw new Error("No content received");
		const bytes = base64ToBytes(res.data.content);
		if (isLikelyBinaryBytes(bytes)) throw binaryReadError(path);
		return new TextDecoder("utf-8").decode(bytes);
	}

	const content = res.data.content ?? "";
	if (isLikelyBinaryText(content)) throw binaryReadError(path);
	return content;
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
	const res = await sendRequest<FsReadResultMsg>({
		type: MsgType.FS_READ,
		data: { path },
	});
	if (res.error) throw new Error(res.error);
	if (!res.data) throw new Error("No data received");

	if (res.data.encoding === "base64") {
		if (!res.data.content) throw new Error("No content received");
		return base64ToBytes(res.data.content);
	}

	return new TextEncoder().encode(res.data.content ?? "");
}

export async function readGitFile(path: string): Promise<string> {
	const res = await sendRequest<GitReadResultMsg>({
		type: MsgType.GIT_READ,
		data: { path },
	});
	if (res.error) throw new Error(res.error);
	if (!res.data) throw new Error("No data received");

	if (res.data.encoding === "base64") {
		if (!res.data.content) throw new Error("No content received");
		const bytes = base64ToBytes(res.data.content);
		if (isLikelyBinaryBytes(bytes)) throw binaryReadError(path);
		return new TextDecoder("utf-8").decode(bytes);
	}

	const content = res.data.content ?? "";
	if (isLikelyBinaryText(content)) throw binaryReadError(path);
	return content;
}

export async function getGitLog(
	path: string,
	options: { skip?: number; limit?: number } = {},
): Promise<GitLogPage> {
	const res = await sendRequest<GitLogResultMsg>({
		type: MsgType.GIT_LOG,
		data: { path, skip: options.skip, limit: options.limit },
	});
	if (res.error) throw new Error(res.error);
	return {
		commits: res.data?.commits ?? [],
		hasMore: res.data?.hasMore ?? false,
		total: res.data?.total ?? 0,
	};
}

export async function getCommitFiles(
	path: string,
	hash: string,
): Promise<GitCommitFile[]> {
	const res = await sendRequest<GitCommitFilesResultMsg>({
		type: MsgType.GIT_COMMIT_FILES,
		data: { path, hash },
	});
	if (res.error) throw new Error(res.error);
	return res.data?.files ?? [];
}

export async function getCommitFileDiff(
	path: string,
	hash: string,
	file: string,
): Promise<GitCommitFileDiff> {
	const res = await sendRequest<GitCommitFileDiffResultMsg>({
		type: MsgType.GIT_COMMIT_FILE_DIFF,
		data: { path, hash, file },
	});
	if (res.error) throw new Error(res.error);
	if (!res.data) throw new Error("No diff data received");
	return res.data;
}

export async function runGitOperation(
	path: string,
	operation: GitOperation,
	options: {
		files?: string[];
		file?: string;
		message?: string;
		branch?: string;
		force?: boolean;
	} = {},
): Promise<NonNullable<GitOperationResultMsg["data"]>> {
	const res = await sendRequest<GitOperationResultMsg>({
		type: MsgType.GIT_OPERATION,
		data: {
			path,
			operation,
			files: options.files,
			file: options.file,
			message: options.message,
			branch: options.branch,
			force: options.force,
		},
	});
	if (res.error) throw new Error(res.error);
	if (!res.data) throw new Error("No git operation data received");
	return res.data;
}

export async function writeFile(
	path: string,
	content: string,
	encoding = "utf-8",
): Promise<void> {
	const res = await sendRequest<FsWriteResultMsg>({
		type: MsgType.FS_WRITE,
		data: {
			path,
			content,
			encoding,
		},
	});
	if (res.error) throw new Error(res.error);
}

export async function writeFileBinary(
	path: string,
	base64Content: string,
): Promise<void> {
	return writeFile(path, base64Content, "base64");
}

export async function createDir(path: string): Promise<void> {
	const res = await sendRequest<FsResultMsg>({
		type: MsgType.FS_MKDIR,
		data: { path },
	});
	if (res.error) throw new Error(res.error);
}

export async function deleteEntry(path: string): Promise<void> {
	const res = await sendRequest<FsResultMsg>({
		type: MsgType.FS_DELETE,
		data: { path },
	});
	if (res.error) throw new Error(res.error);
}
