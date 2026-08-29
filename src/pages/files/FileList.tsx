import dialog from "bridge/dialog";
import file from "bridge/file";
import native from "bridge/native";
import AppMenu, {
	type AppMenuItem,
	showAppMenuItems,
} from "components/AppMenu";
import EmptyState from "components/EmptyState";
import { getFileIcon } from "lib/fileIcon";
import { joinRemotePath } from "lib/remotePath";
import toast from "lib/toast";
import { formatFileSize } from "lib/utils";
import { useState } from "react";
import type { FileEntry, GitFileStatus, ProjectFileSearchEntry } from "state";
import { deleteEntry, readFileBytes } from "state/filesystem";

export type FILE_MODE = "default" | "picker" | "project";

interface Props {
	mode: FILE_MODE;
	entries: FileEntry[];
	onNavigate: (entry: FileEntry) => void;
	getMeta?: (entry: FileEntry) => string;
	currentPath?: string;
	onRefresh?: () => void;
}

const GIT_STATUS_LABEL: Record<GitFileStatus, string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "U",
	ignored: "I",
	staged: "S",
};

function GitStatusText({ status }: { status: GitFileStatus }) {
	if (status === "ignored") {
		return null;
	}

	return (
		<span className="file-git-status" title={status} aria-hidden="true">
			{GIT_STATUS_LABEL[status]}
		</span>
	);
}

export default function FileList({
	entries,
	onNavigate,
	getMeta,
	mode,
	currentPath,
	onRefresh,
}: Props) {
	const [activeItem, setActiveItem] = useState<string | null>(null);

	const resolvePath = (entry: FileEntry) => {
		const path = (entry as ProjectFileSearchEntry).path;
		if (typeof path === "string") return path;
		return !currentPath || currentPath === "."
			? entry.name
			: joinRemotePath(currentPath, entry.name ?? "");
	};
	const fileMenuItems = (entry: FileEntry): AppMenuItem[] => [
		{
			icon: "icon-trash",
			label: "Delete",
			onClick: async () => {
				const serverPath = resolvePath(entry);
				const confirmed = await dialog.confirm(
					`Delete "${entry.name}"? This cannot be undone.`,
					"Delete File",
				);
				if (!confirmed) return;
				await deleteEntry(serverPath);
				onRefresh?.();
			},
			danger: true,
		},
		{
			icon: "icon-download",
			label: "Download",
			onClick: async () => {
				try {
					const serverPath = resolvePath(entry);
					const bytes = await readFileBytes(serverPath);
					const localPath = `__share__/download/${entry.name}`;
					await file.writeBinary(localPath, bytes);
					await file.saveToDevice(localPath, entry.name);
					toast(`Downloaded to ${localPath}`);
				} catch (error) {
					console.error(error);
					toast("Failed to download");
				}
			},
		},
		{
			icon: "icon-share",
			label: "Share",
			onClick: async () => {
				try {
					const serverPath = resolvePath(entry);
					const bytes = await readFileBytes(serverPath);
					const localPath = `__share__/share/${entry.name}`;
					await file.writeBinary(localPath, bytes);
					const resolved = await file.resolve(localPath);
					await native.shareFile(resolved, entry.name);
					toast("Shared successfully");
				} catch (error) {
					toast("Failed to share");
					console.error(error);
				}
			},
		},
	];

	if (!entries.length) {
		return <EmptyState message="Empty directory" mascot="idle" />;
	}

	return (
		<>
			{entries.map((entry) => (
				<div
					key={entry.name}
					data-active={activeItem === entry.name || undefined}
					data-git-status={entry.gitStatus ?? undefined}
					className="file-item"
					onContextMenu={(event) => {
						if (
							!process.env.IS_DESKTOP_UI ||
							mode === "picker" ||
							entry.type !== "file"
						) {
							return;
						}
						event.preventDefault();
						event.stopPropagation();
						setActiveItem(entry.name);
						void showAppMenuItems(
							fileMenuItems(entry),
							{ kind: "point", x: event.clientX, y: event.clientY },
							event.currentTarget,
							"context",
						).finally(() => {
							setActiveItem((current) =>
								current === entry.name ? null : current,
							);
						});
					}}
				>
					<button
						className="file-item-info"
						type="button"
						onClick={() => onNavigate(entry)}
					>
						<div
							className={`file-icon ${entry.type === "directory" ? "folder-icon" : "doc-icon"}`}
						>
							{entry.type === "directory" ? (
								<span className="icon-folder" aria-hidden="true" />
							) : (
								<span className={getFileIcon(entry.name)} aria-hidden="true" />
							)}
						</div>
						<div className="file-info">
							<span className="file-name">{entry.name}</span>
							<span className="file-meta">
								{getMeta?.(entry) ??
									(entry.type === "file" && formatFileSize(entry.size))}
							</span>
						</div>
						{entry.gitStatus && <GitStatusText status={entry.gitStatus} />}
					</button>
					{mode !== "picker" && entry.type === "file" && (
						<AppMenu
							onToggle={(open) => {
								setActiveItem((current) =>
									open ? entry.name : current === entry.name ? null : current,
								);
							}}
							items={fileMenuItems(entry)}
							ariaLabel="File option"
						/>
					)}
					{entry.type === "directory" && (
						<span className="icon-chevron-right" />
					)}
				</div>
			))}
		</>
	);
}
