import actionStack from "lib/actionStack";
import { joinRemotePath, normalizeRemoteWorkspacePath } from "lib/remotePath";
import {
	loadSettings,
	SETTINGS_CHANGED_EVENT,
	saveSettings,
} from "lib/settings";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileEntry, ProjectFileSearchEntry } from "state";
import { useShellular } from "state";
import { createDir } from "state/filesystem";
import FileList, { type FILE_MODE } from "./FileList";
import "./style.scss";
import { pushPage } from "App";
import dialog from "bridge/dialog";
import { bytesToBase64 } from "bridge/file";
import AppMenu, { type AppMenuItem } from "components/AppMenu";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import PageSearchToolbar from "components/PageSearchToolbar";
import EditorPage from "pages/editor";
import { openInWorkbench } from "workbench/navigation";
import { tryOpenEditorSurface } from "workbench/openers";
import { useIsWorkbenchPageChromeActive } from "workbench/pageChrome";
import { showGitHistorySidebar } from "workbench/secondarySidebar";
import { closeWorkbenchDialog } from "workbench/store";

export interface FileBrowserPageProps {
	title?: string;
	initialPath?: string;
	onSelectFolder?: (path: string) => void;
	mode?: FILE_MODE;
	embedded?: boolean;
	searchRequest?: number;
	onNavigate?: () => void;
	onOpenGitHistory?: () => void;
}

export default function FileBrowserPage({
	title = "Files",
	initialPath,
	onSelectFolder,
	mode = "default",
	embedded = false,
	searchRequest,
	onNavigate,
	onOpenGitHistory,
}: FileBrowserPageProps) {
	const {
		connectionStatus,
		hostDir,
		listDir,
		searchProjectFiles,
		writeFile,
		writeFileBinary,
	} = useShellular();
	const [currentPath, setCurrentPath] = useState(initialPath ?? ".");
	const [entries, setEntries] = useState<FileEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<ProjectFileSearchEntry[]>(
		[],
	);
	const [searchHistory, setSearchHistory] = useState<string[]>([]);
	const [searchStatus, setSearchStatus] = useState<{
		isScanning: boolean;
		scannedFilesCount: number;
		indexedFiles?: number;
		diagnostics?: {
			nativeAvailable: boolean;
			gitAvailable?: boolean;
			repositoryFound?: boolean;
			issues: string[];
		};
	}>({
		isScanning: false,
		scannedFilesCount: 0,
	});
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [searchClosing, setSearchClosing] = useState(false);
	const [navDepth, setNavDepth] = useState(0);
	const navHistoryRef = useRef<{ path: string; id: string }[]>([]);
	const forwardHistoryRef = useRef<string[]>([]);
	const [forwardDepth, setForwardDepth] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const searchCloseTimerRef = useRef<number | null>(null);
	const uploadInputRef = useRef<HTMLInputElement>(null);
	const uploadTimerRef = useRef<number | null>(null);
	const isWorkbenchTab = useIsWorkbenchPageChromeActive();
	const [uploadState, setUploadState] = useState<{
		startTime: number;
		filename: string;
		elapsedSec: number;
	} | null>(null);
	const [showHidden, setShowHidden] = useState(false);
	const [settingsReady, setSettingsReady] = useState(false);

	useEffect(() => {
		loadSettings()
			.then((s) => setShowHidden(s.showHiddenFiles))
			.catch(console.error)
			.finally(() => setSettingsReady(true));

		const onSettingsChanged = (event: Event) => {
			const detail = (event as CustomEvent).detail as {
				showHiddenFiles?: boolean;
			};
			if (typeof detail.showHiddenFiles === "boolean") {
				setShowHidden(detail.showHiddenFiles);
			}
		};
		window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);

		return () => {
			window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
		};
	}, []);

	const currentPathRef = useRef(currentPath);
	currentPathRef.current = currentPath;
	const searchRootPath =
		mode === "project" ? (initialPath ?? ".") : currentPath;
	const searchVisible = searchOpen || searchClosing;
	const effectiveSearchOpen = searchOpen;

	const fetchDir = useCallback(
		async (path: string) => {
			setLoading(true);
			setError(null);
			try {
				const result = await listDir(path, showHidden);
				result.sort((a, b) => {
					if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
					return a.name.localeCompare(b.name);
				});
				setEntries(result);
				setCurrentPath(path);
			} catch (err) {
				setError((err as Error).message || "Failed to list directory");
			} finally {
				setLoading(false);
			}
		},
		[listDir, showHidden],
	);

	const closePage = useCallback(() => {
		navHistoryRef.current.forEach((entry) => {
			actionStack.remove(entry.id);
		});
		navHistoryRef.current = [];
		actionStack.pop();
	}, []);

	const closeSearch = useCallback(() => {
		if (!searchOpen && !searchClosing) return;
		if (searchCloseTimerRef.current) {
			window.clearTimeout(searchCloseTimerRef.current);
		}
		setSearchOpen(false);
		setSearchClosing(true);
		setSearchQuery("");
		setSearchResults([]);
		setSearchHistory([]);
		setSearchError(null);
		setSearchLoading(false);
		searchCloseTimerRef.current = window.setTimeout(() => {
			setSearchClosing(false);
			searchCloseTimerRef.current = null;
		}, 160);
	}, [searchClosing, searchOpen]);

	const openSearch = useCallback(() => {
		if (searchCloseTimerRef.current) {
			window.clearTimeout(searchCloseTimerRef.current);
			searchCloseTimerRef.current = null;
		}
		setSearchClosing(false);
		setSearchOpen(true);
	}, []);

	useEffect(() => {
		if (searchRequest) openSearch();
	}, [openSearch, searchRequest]);

	const toggleSearch = useCallback(() => {
		if (searchOpen) closeSearch();
		else openSearch();
	}, [closeSearch, openSearch, searchOpen]);

	const toggleShowHidden = useCallback(() => {
		setShowHidden((prev) => {
			const next = !prev;
			saveSettings({ showHiddenFiles: next }).catch(console.error);
			return next;
		});
	}, []);

	const openEntry = useCallback(
		(entry: FileEntry, targetPath: string) => {
			if (entry.type === "directory") {
				const id = `files-nav-${Date.now()}`;
				const prevPath = currentPath;
				navHistoryRef.current.push({ path: prevPath, id });
				forwardHistoryRef.current = [];
				setForwardDepth(0);
				actionStack.push({
					id,
					action: () => {
						navHistoryRef.current.pop();
						setNavDepth((depth) => Math.max(0, depth - 1));
						fetchDir(prevPath);
					},
				});
				setNavDepth((depth) => depth + 1);
				fetchDir(targetPath);
				closeSearch();

				return;
			}

			const pageId = `file-${entry.name}-${Date.now()}`;
			if (
				tryOpenEditorSurface({
					id: pageId,
					title: entry.name,
					filePath: targetPath,
					gitStatus: entry.gitStatus,
				})
			) {
				closeWorkbenchDialog();
				onNavigate?.();
				return;
			}
			pushPage(
				pageId,
				<EditorPage
					filePath={targetPath}
					gitStatus={entry.gitStatus}
					pageId={pageId}
				/>,
			);
			onNavigate?.();
		},
		[closeSearch, currentPath, fetchDir, onNavigate],
	);

	const handleNavigate = useCallback(
		(entry: FileEntry) => {
			const targetPath =
				currentPath === "."
					? entry.name
					: joinRemotePath(currentPath, entry.name);
			openEntry(entry, targetPath);
		},
		[currentPath, openEntry],
	);

	const handleSearchNavigate = useCallback(
		(entry: ProjectFileSearchEntry) => {
			if (searchQuery.trim()) {
				searchProjectFiles(searchRootPath, searchQuery.trim(), {
					selectedPath: entry.path,
					includeHistory: true,
				}).catch(console.error);
			}
			openEntry(entry, entry.path);
		},
		[openEntry, searchProjectFiles, searchQuery, searchRootPath],
	);

	useEffect(() => {
		if (connectionStatus === "connected" && settingsReady) {
			fetchDir(currentPathRef.current);
		}
	}, [connectionStatus, settingsReady, fetchDir]);

	useEffect(() => {
		return () => {
			if (searchCloseTimerRef.current) {
				window.clearTimeout(searchCloseTimerRef.current);
			}
			for (const entry of navHistoryRef.current) {
				actionStack.remove(entry.id);
			}
			navHistoryRef.current = [];
			forwardHistoryRef.current = [];
		};
	}, []);

	useEffect(() => {
		if (searchOpen) {
			requestAnimationFrame(() => searchInputRef.current?.focus());
		}
	}, [searchOpen]);

	useEffect(() => {
		if (!uploadState) return;
		uploadTimerRef.current = window.setInterval(() => {
			setUploadState((prev) =>
				prev
					? {
							...prev,
							elapsedSec: Math.round((Date.now() - prev.startTime) / 1000),
						}
					: prev,
			);
		}, 1000);
		return () => {
			if (uploadTimerRef.current) {
				window.clearInterval(uploadTimerRef.current);
				uploadTimerRef.current = null;
			}
		};
	}, [uploadState]);

	useEffect(() => {
		if (!effectiveSearchOpen) {
			setSearchResults([]);
			setSearchLoading(false);
			setSearchError(null);
			return;
		}

		const query = searchQuery.trim();

		let cancelled = false;
		setSearchLoading(Boolean(query));
		setSearchError(null);
		const timeout = window.setTimeout(() => {
			searchProjectFiles(searchRootPath, query, {
				limit: 40,
				includeHistory: true,
			})
				.then((result) => {
					if (cancelled) return;
					setSearchResults(result.entries);
					setSearchHistory(result.history);
					setSearchStatus(result.status);
				})
				.catch((err) => {
					if (cancelled) return;
					setSearchResults([]);
					setSearchError((err as Error).message || "Search failed");
				})
				.finally(() => {
					if (!cancelled) setSearchLoading(false);
				});
		}, 120);

		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [effectiveSearchOpen, searchProjectFiles, searchQuery, searchRootPath]);

	const refreshCurrentView = useCallback(() => {
		fetchDir(currentPath);
		if (!effectiveSearchOpen) return;
		searchProjectFiles(searchRootPath, searchQuery.trim(), {
			limit: 40,
			includeHistory: true,
			refresh: true,
		})
			.then((result) => {
				setSearchResults(result.entries);
				setSearchHistory(result.history);
				setSearchStatus(result.status);
				setSearchError(null);
			})
			.catch((err) => {
				setSearchError((err as Error).message || "Search refresh failed");
			});
	}, [
		currentPath,
		effectiveSearchOpen,
		fetchDir,
		searchProjectFiles,
		searchQuery,
		searchRootPath,
	]);

	const displayPath = normalizeRemoteWorkspacePath(currentPath, hostDir);
	const breadcrumbs = displayPath.split("/").filter(Boolean);
	const isSearchMode = effectiveSearchOpen && searchQuery.trim().length > 0;

	const buildServerPath = useCallback(
		(name: string) =>
			currentPath === "." ? name : joinRemotePath(currentPath, name),
		[currentPath],
	);

	const handleUploadClick = useCallback(() => {
		uploadInputRef.current?.click();
	}, []);

	const handleFilePicked = useCallback(
		async (file: File | null | undefined) => {
			if (!file) return;
			const serverPath = buildServerPath(file.name);
			const startTime = Date.now();
			setUploadState({ startTime, filename: file.name, elapsedSec: 0 });
			try {
				const buffer = await file.arrayBuffer();
				const bytes = new Uint8Array(buffer);
				await writeFileBinary(serverPath, bytesToBase64(bytes));
				fetchDir(currentPath);
			} catch (err) {
				setError((err as Error).message || "Upload failed");
			} finally {
				setUploadState(null);
			}
		},
		[buildServerPath, currentPath, fetchDir, writeFileBinary],
	);

	const handleNewFile = useCallback(async () => {
		const name = await dialog.textInput("File name:", "", "New File");
		if (!name) return;
		const serverPath = buildServerPath(name);
		await writeFile(serverPath, "");
		fetchDir(currentPath);
	}, [buildServerPath, currentPath, fetchDir, writeFile]);

	const handleNewDir = useCallback(async () => {
		const name = await dialog.textInput("Directory name:", "", "New Directory");
		if (!name) return;
		const serverPath = buildServerPath(name);
		await createDir(serverPath);
		fetchDir(currentPath);
	}, [buildServerPath, currentPath, fetchDir]);

	const openGitHistory = useCallback(async () => {
		const projectPath = initialPath ?? ".";
		if (onOpenGitHistory) {
			onOpenGitHistory();
			return;
		}
		if (process.env.IS_DESKTOP_UI) {
			showGitHistorySidebar(projectPath, title);
			return;
		}
		if (
			openInWorkbench({
				kind: "git",
				id: `git:${projectPath}`,
				title: `${title} · Git`,
				icon: "icon-git-branch",
				projectPath,
				projectName: title,
			})
		)
			return;
		const GitClientPage = await import("pages/git-client");
		pushPage(
			`git-client-${projectPath}`,
			<GitClientPage.default projectPath={projectPath} projectName={title} />,
		);
	}, [initialPath, onOpenGitHistory, title]);

	const navigateBack = useCallback(() => {
		const entry = navHistoryRef.current.pop();
		if (!entry) return;
		actionStack.remove(entry.id);
		forwardHistoryRef.current.push(currentPath);
		setForwardDepth(forwardHistoryRef.current.length);
		setNavDepth((depth) => Math.max(0, depth - 1));
		fetchDir(entry.path);
		closeSearch();
	}, [closeSearch, currentPath, fetchDir]);

	const navigateForward = useCallback(() => {
		const nextPath = forwardHistoryRef.current.pop();
		if (!nextPath) return;
		const id = `files-nav-${Date.now()}`;
		const prevPath = currentPath;
		navHistoryRef.current.push({ path: prevPath, id });
		setForwardDepth(forwardHistoryRef.current.length);
		actionStack.push({
			id,
			action: () => {
				navHistoryRef.current.pop();
				setNavDepth((depth) => Math.max(0, depth - 1));
				fetchDir(prevPath);
			},
		});
		setNavDepth((depth) => depth + 1);
		fetchDir(nextPath);
		closeSearch();
	}, [closeSearch, currentPath, fetchDir]);

	const fileMenuItems: AppMenuItem[] = [
		{
			icon: "icon-refresh-cw",
			label: "Refresh",
			onClick: refreshCurrentView,
		},
		{
			icon: "icon-upload",
			label: "Upload File",
			onClick: handleUploadClick,
		},
		{
			icon: showHidden ? "icon-eye" : "icon-eye-off",
			label: showHidden ? "Hide hidden files" : "Show hidden files",
			onClick: toggleShowHidden,
		},
		{
			divider: true,
			icon: "icon-file-plus",
			label: "New File",
			onClick: handleNewFile,
		},
		{
			icon: "icon-folder-plus",
			label: "New Directory",
			onClick: handleNewDir,
		},
	];
	const footer =
		!embedded && (onSelectFolder || !isWorkbenchTab) ? (
			<div className="files-footer" data-disabled={loading}>
				{onSelectFolder && (
					<button
						type="button"
						className="files-page-done-button"
						onClick={() => {
							onSelectFolder(displayPath);
							closePage();
						}}
					>
						<span className="icon-check" aria-hidden="true" />
						Select
					</button>
				)}
				{!isWorkbenchTab && (
					<button
						type="button"
						className="files-close-button"
						onClick={closePage}
						aria-label="Close"
					>
						<span className="icon-x" aria-hidden="true" />
						Close
					</button>
				)}
			</div>
		) : null;
	const renderFileActions = () => (
		<>
			{mode === "project" && !searchVisible && (
				<button
					type="button"
					className="files-refresh"
					onClick={openGitHistory}
					aria-label="Git history"
				>
					<span className="icon-git-branch" aria-hidden="true" />
				</button>
			)}
			<button
				type="button"
				className="files-refresh files-search-toggle"
				data-active={searchVisible}
				onClick={toggleSearch}
				aria-label={searchOpen ? "Close search" : "Search project"}
			>
				<span
					className={searchOpen ? "icon-x" : "icon-search"}
					aria-hidden="true"
				/>
			</button>
			{!searchVisible && (
				<AppMenu
					ariaLabel="File actions"
					buttonClassName="files-refresh"
					items={fileMenuItems}
				>
					<span className="icon-more-vertical" aria-hidden="true" />
				</AppMenu>
			)}
		</>
	);

	return (
		<>
			<Page
				title={title}
				subtitle={breadcrumbs.join(" / ")}
				className="files-page"
				reverseTruncate={true}
				desktopNavigationControls={[
					{
						id: "files-back",
						label: "Back",
						icon: "icon-chevron-left",
						disabled: navDepth === 0,
						onClick: navigateBack,
					},
					{
						id: "files-forward",
						label: "Forward",
						icon: "icon-chevron-right",
						disabled: forwardDepth === 0,
						onClick: navigateForward,
					},
				]}
				toolbarSlot={
					searchVisible ? (
						<PageSearchToolbar
							inputRef={searchInputRef}
							value={searchQuery}
							onChange={setSearchQuery}
							onDismiss={closeSearch}
							placeholder={`Search ${title}`}
							ariaLabel="Search project files"
							closing={searchClosing}
						/>
					) : undefined
				}
				rightSlot={embedded ? undefined : renderFileActions()}
				footerSlot={footer}
			>
				{embedded && (
					<div className="secondary-sidebar-page-controls">
						<button
							type="button"
							className="files-refresh"
							onClick={navigateBack}
							disabled={navDepth === 0}
							aria-label="Back"
						>
							<span className="icon-chevron-left" aria-hidden="true" />
						</button>
						<button
							type="button"
							className="files-refresh"
							onClick={navigateForward}
							disabled={forwardDepth === 0}
							aria-label="Forward"
						>
							<span className="icon-chevron-right" aria-hidden="true" />
						</button>
						<span
							className="min-w-0 flex-1 truncate px-1 text-[11px] text-secondary-text"
							title={displayPath}
						>
							{breadcrumbs.join(" / ") || displayPath}
						</span>
						{renderFileActions()}
					</div>
				)}
				{error && <EmptyState message={error} mascot="error" />}
				{searchOpen && !searchQuery.trim() ? (
					<div className="files-search-history">
						<div className="files-search-status">
							{searchStatus.isScanning
								? `Indexing ${searchStatus.scannedFilesCount} files...`
								: searchStatus.indexedFiles
									? `${searchStatus.indexedFiles} indexed files`
									: "Type to search files"}
						</div>
						{searchStatus.diagnostics?.issues.length ? (
							<div className="files-search-diagnostic">
								{searchStatus.diagnostics.issues[0]}
							</div>
						) : null}
						{searchHistory.length > 0 ? (
							<div className="files-search-history-list">
								{searchHistory.map((query) => (
									<button
										type="button"
										key={query}
										className="files-search-history-item"
										onClick={() => setSearchQuery(query)}
									>
										<span className="icon-clock" aria-hidden="true" />
										<span>{query}</span>
									</button>
								))}
							</div>
						) : (
							<EmptyState message="Type to search files" mascot="thinking" />
						)}
					</div>
				) : searchLoading ? (
					<EmptyState
						message={
							searchStatus.isScanning
								? `Indexing ${searchStatus.scannedFilesCount} files...`
								: "Searching..."
						}
						mascot="loading"
					/>
				) : searchError ? (
					<EmptyState message={searchError} mascot="error" />
				) : isSearchMode && searchResults.length === 0 ? (
					<EmptyState message="No matching files" mascot="thinking" />
				) : loading ? (
					<EmptyState message="Loading..." mascot="loading" />
				) : isSearchMode ? (
					<FileList
						mode={mode}
						entries={searchResults}
						onNavigate={(entry) =>
							handleSearchNavigate(entry as ProjectFileSearchEntry)
						}
						getMeta={(entry) => (entry as ProjectFileSearchEntry).relativePath}
						currentPath={currentPath}
						onRefresh={refreshCurrentView}
					/>
				) : (
					<FileList
						entries={entries}
						mode={mode}
						onNavigate={handleNavigate}
						currentPath={currentPath}
						onRefresh={refreshCurrentView}
					/>
				)}
			</Page>
			{uploadState && (
				<div className="files-upload-overlay">
					<span className="icon-upload files-upload-spin" aria-hidden="true" />
					<span className="files-upload-name">{uploadState.filename}</span>
					<span className="files-upload-time">
						Uploading... ({uploadState.elapsedSec}s)
					</span>
				</div>
			)}
			<input
				ref={uploadInputRef}
				type="file"
				hidden
				onChange={(e) => handleFilePicked(e.currentTarget.files?.[0])}
			/>
		</>
	);
}
