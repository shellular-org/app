import "./ChangedFilesBlock.scss";
import type { AcpMessagePart } from "@shellular/protocol";
import FileChangePartView from "./FileChangePartView";

export interface FileChangeEntry {
	path: string;
	added: number;
	removed: number;
	isNew: boolean;
}

type FileChangePart = Extract<AcpMessagePart, { type: "file_change" }>;

/**
 * The turn's file changes, summarised under the answer. Nothing here is new
 * data: these are the same `file_change` parts the work log already carries,
 * lifted out because "which files did it touch" is the question a phone reader
 * asks first and the transcript answers last.
 */
export default function ChangedFilesBlock({
	parts,
}: {
	parts: AcpMessagePart[];
}) {
	const entries = collectFileChanges(parts);
	if (entries.length === 0) return null;

	// One row per file, not per part: a file edited four times is one changed
	// file. The last part carries the diff the row opens.
	const lastByPath = new Map<string, FileChangePart>();
	for (const part of parts) {
		if (part.type === "file_change") lastByPath.set(part.path, part);
	}

	return (
		<section className="changed-files" aria-label="Changed files">
			<div className="changed-files-head">Changed files</div>
			{entries.map((entry) => {
				const part = lastByPath.get(entry.path);
				if (!part) return null;
				return (
					<FileChangePartView
						key={entry.path}
						part={part}
						stat={<DiffStat entry={entry} />}
					/>
				);
			})}
		</section>
	);
}

function DiffStat({ entry }: { entry: FileChangeEntry }) {
	if (entry.isNew) {
		return (
			<span className="changed-files-stat">
				<span className="changed-files-stat-new">new</span>
				<span className="changed-files-stat-added">{`+${entry.added}`}</span>
			</span>
		);
	}
	return (
		<span className="changed-files-stat">
			{entry.added > 0 ? (
				<span className="changed-files-stat-added">{`+${entry.added}`}</span>
			) : null}
			{entry.removed > 0 ? (
				<span className="changed-files-stat-removed">{`−${entry.removed}`}</span>
			) : null}
		</span>
	);
}

export function collectFileChanges(
	parts: readonly AcpMessagePart[],
): FileChangeEntry[] {
	const byPath = new Map<string, FileChangeEntry>();
	for (const part of parts) {
		if (part.type !== "file_change") continue;
		const diff = "diff" in part ? part.diff : undefined;
		if (!diff) continue;
		const oldLines = diff.old ? diff.old.split(/\r?\n/) : [];
		const newLines = diff.new ? diff.new.split(/\r?\n/) : [];
		const common = countCommonLines(oldLines, newLines);
		byPath.set(part.path, {
			path: part.path,
			added: newLines.length - common,
			removed: oldLines.length - common,
			isNew: oldLines.length === 0,
		});
	}
	return Array.from(byPath.values());
}

/** A line-level count, not a real diff: enough for a `+n −m` badge. */
function countCommonLines(
	oldLines: readonly string[],
	newLines: readonly string[],
): number {
	const remaining = new Map<string, number>();
	for (const line of oldLines)
		remaining.set(line, (remaining.get(line) ?? 0) + 1);
	let common = 0;
	for (const line of newLines) {
		const count = remaining.get(line) ?? 0;
		if (count > 0) {
			remaining.set(line, count - 1);
			common += 1;
		}
	}
	return common;
}
