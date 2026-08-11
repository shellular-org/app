import "./style.scss";
import { pushPage } from "App";
import type { AiBackend, AiSession } from "@shellular/protocol";
import AppMenu from "components/AppMenu";
import BottomSheet from "components/BottomSheet";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Page from "components/Page";
import PageSearchToolbar from "components/PageSearchToolbar";
import { getAgentIcon } from "lib/agents";
import { chatTabId } from "lib/chatTabId";
import { copyToClipboard } from "lib/clipboard";
import { formatRelativeTime } from "lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShellular } from "state";
import { type AcpAgentInfo, acpListSessions } from "state/acp";
import {
	type BookmarkedSession,
	useBookmarkedSessions,
} from "state/bookmarkSessions";
import { useAllChatTabs } from "state/chatTabs";
import {
	getStreamingSessions,
	listenToSessionStreamingEvent,
} from "state/sessions";
import { tryOpenChatSurface } from "workbench/openers";

export default function ChatSessionsPage({
	backend,
	agent,
	workspace,
	embedded = false,
	onNavigate,
	onWorkspaceChange,
	activeChatId,
}: {
	backend: AiBackend;
	agent: AcpAgentInfo;
	workspace?: string;
	embedded?: boolean;
	onNavigate?: () => void;
	onWorkspaceChange?: (workspace?: string) => void;
	activeChatId?: string;
}) {
	const agentIcon = getAgentIcon(agent.id);
	const pageTitle = workspace
		? `${agent.title} · ${getBasename(workspace)}`
		: agent.title;
	const { connectionStatus, projects, addProject } = useShellular();
	const [sessions, setSessions] = useState<AiSession[]>([]);
	const localChatTabs = useAllChatTabs();
	const [agentAvailable, setAgentAvailable] = useState(true);
	const [activeSessionItem, setActiveSessionItem] = useState<string | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState("");
	const [loadMoreError, setLoadMoreError] = useState("");
	const [nextCursor, setNextCursor] = useState<string | undefined>();
	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [streamingSessions, setStreamingSessions] = useState(
		getStreamingSessions(backend),
	);
	const {
		bookmarked,
		isBookmarked,
		toggleBookmark: togglePin,
	} = useBookmarkedSessions(backend);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [bookmarkedExpanded, setBookmarkedExpanded] = useState(false);
	const [showInfo, setShowInfo] = useState(false);
	const infoNote = agentAvailable ? (agent.note ?? null) : null;
	const [searchClosing, setSearchClosing] = useState(false);
	const searchCloseTimerRef = useRef<number | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const searchVisible = searchOpen || searchClosing;

	const closeSearch = useCallback(() => {
		if (!searchOpen && !searchClosing) return;
		if (searchCloseTimerRef.current) {
			window.clearTimeout(searchCloseTimerRef.current);
		}
		setSearchOpen(false);
		setSearchClosing(true);
		setSearchQuery("");
		searchCloseTimerRef.current = window.setTimeout(() => {
			setSearchClosing(false);
			searchCloseTimerRef.current = null;
		}, 160);
	}, [searchClosing, searchOpen]);

	const toggleSearch = useCallback(() => {
		if (searchOpen) closeSearch();
		else {
			if (searchCloseTimerRef.current) {
				window.clearTimeout(searchCloseTimerRef.current);
				searchCloseTimerRef.current = null;
			}
			setSearchClosing(false);
			setSearchOpen(true);
		}
	}, [closeSearch, searchOpen]);

	const hasMoreSessions = Boolean(nextCursor);

	const scopedLocalTabs = useMemo(
		() =>
			localChatTabs.filter(
				(tab) =>
					tab.agentId === backend &&
					(!workspace || tab.projectPath === workspace),
			),
		[backend, localChatTabs, workspace],
	);
	const draftTabs = useMemo(
		() => scopedLocalTabs.filter((tab) => !tab.sessionId),
		[scopedLocalTabs],
	);
	const mergedSessions = useMemo(() => {
		const known = new Set(sessions.map((session) => session.id).filter(Boolean));
		const cached = scopedLocalTabs
			.filter((tab) => tab.sessionId && !known.has(tab.sessionId))
			.map(
				(tab): AiSession => ({
					id: tab.sessionId,
					title: tab.title,
					workspacePath: tab.projectPath,
					createdAt: tab.createdAt,
					updatedAt: tab.updatedAt,
				}),
			);
		return [...sessions, ...cached].sort(
			(left, right) => right.updatedAt - left.updatedAt,
		);
	}, [scopedLocalTabs, sessions]);

	const filteredSessions = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return mergedSessions;
		return mergedSessions.filter((session) => {
			const haystack = [
				session.title,
				session.model,
				session.workspacePath?.split("/").slice(-1)[0],
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [mergedSessions, searchQuery]);

	const filteredBookmarks = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return bookmarked;
		return bookmarked.filter((bookmark) => {
			const haystack = [
				bookmark.title,
				bookmark.workspacePath?.split("/").slice(-1)[0],
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [bookmarked, searchQuery]);
	const filteredDraftTabs = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return draftTabs;
		return draftTabs.filter((tab) =>
			[tab.title, tab.projectPath]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [draftTabs, searchQuery]);

	const sessionGroups = useMemo(
		() => groupSessionsByDate(filteredSessions),
		[filteredSessions],
	);
	const isSearching = Boolean(searchQuery.trim());
	const showBookmarkedCards = bookmarkedExpanded || isSearching;
	const showSessionsHeader =
		filteredBookmarks.length > 0 && showBookmarkedCards;

	const copySessionId = useCallback((id: string | undefined) => {
		if (!id) return;
		copyToClipboard({
			text: id,
			successMessage: "Session ID copied",
		});
	}, []);

	const copyResumeCommand = useCallback(
		(session: AiSession) => {
			if (!session.id) return;
			const cmd = getResumeCommand(backend, session.id, session.workspacePath);
			copyToClipboard({
				text: cmd,
				successMessage: "Resume command copied",
			});
		},
		[backend],
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		setLoadMoreError("");
		try {
			const result = await acpListSessions(backend, workspace, agent);
			setAgentAvailable(result.agentAvailable ?? true);
			setSessions(result.sessions);
			setNextCursor(result.nextCursor);
		} catch (err) {
			setError((err as Error).message ?? "Failed to load sessions");
		} finally {
			setLoading(false);
		}
	}, [agent, backend, workspace]);

	const loadMore = useCallback(async () => {
		if (!nextCursor || loadingMore) return;
		setLoadingMore(true);
		setLoadMoreError("");
		try {
			const result = await acpListSessions(
				backend,
				workspace,
				agent,
				nextCursor,
			);
			setAgentAvailable(result.agentAvailable ?? true);
			setSessions((current) => appendUniqueSessions(current, result.sessions));
			setNextCursor(result.nextCursor);
		} catch (err) {
			setLoadMoreError(
				(err as Error).message ?? "Failed to load more sessions",
			);
		} finally {
			setLoadingMore(false);
		}
	}, [agent, backend, loadingMore, nextCursor, workspace]);

	const openChat = useCallback(
		async (opts: {
			sessionId: string;
			title: string;
			workspacePath: string;
			tabId?: string;
		}) => {
			const tabId = opts.tabId ?? chatTabId(backend, opts.sessionId);
			if (
				tryOpenChatSurface({
					id: tabId,
					agentId: backend,
					sessionId: opts.sessionId,
					title: opts.title,
					workspacePath: opts.workspacePath,
					createOnFirstMessage: !opts.sessionId,
				})
			) {
				onNavigate?.();
				return;
			}
			const ChatConversationPage = await import("pages/chat");
			pushPage(
				tabId,
				<ChatConversationPage.default
					chatTabId={tabId}
					sessionId={opts.sessionId}
					title={opts.title}
					agentId={backend}
					workspacePath={opts.workspacePath}
					assistantName={agent.name}
					agentAvailable={agentAvailable}
					unavailableMessage={`${agent.name} is not available on this device.`}
					providerName={agent.title}
					agentCapabilities={agent?.capabilities}
					createOnFirstMessage={!opts.sessionId}
				/>,
			);
			onNavigate?.();
		},
		[
			agent?.capabilities,
			agentAvailable,
			agent.name,
			agent.title,
			backend,
			onNavigate,
		],
	);

	const openNewChatForWorkspace = useCallback(
		(path: string) =>
			openChat({ sessionId: "", title: "New Chat", workspacePath: path }),
		[openChat],
	);

	const openSession = useCallback(
		(session: AiSession) => {
			if (!session.id) return;
			openChat({
				sessionId: session.id,
				title: session.title ?? session.id,
				workspacePath: session.workspacePath ?? workspace ?? "",
			});
		},
		[openChat, workspace],
	);

	const openBookmarkedSession = useCallback(
		(bookmark: (typeof bookmarked)[number]) => {
			openChat({
				sessionId: bookmark.sessionId,
				title: bookmark.title,
				workspacePath: bookmark.workspacePath,
			});
		},
		[openChat],
	);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		const container = scrollRef.current;
		if (
			!sentinel ||
			!container ||
			!hasMoreSessions ||
			loading ||
			loadingMore ||
			loadMoreError
		) {
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					loadMore();
				}
			},
			{ root: container, rootMargin: "0px 0px 300px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasMoreSessions, loadMore, loadMoreError, loading, loadingMore]);

	useEffect(() => {
		if (connectionStatus === "connected") {
			load();
		}
	}, [connectionStatus, load]);

	useEffect(() => {
		writeBookmarkedExpanded(backend, bookmarkedExpanded);
	}, [backend, bookmarkedExpanded]);

	useEffect(
		() =>
			listenToSessionStreamingEvent((agentId) => {
				if (agentId === backend) {
					setStreamingSessions(getStreamingSessions(backend));
				}
			}),
		[backend],
	);

	useEffect(() => {
		if (searchOpen) {
			requestAnimationFrame(() => searchInputRef.current?.focus());
		}
	}, [searchOpen]);

	useEffect(() => {
		return () => {
			if (searchCloseTimerRef.current) {
				window.clearTimeout(searchCloseTimerRef.current);
			}
		};
	}, []);

	if (connectionStatus !== "connected") {
		return (
			<Page
				title={pageTitle}
				className={`agent-sessions-page${embedded ? " is-sidebar-embedded" : ""}`}
			>
				<EmptyState message="Not connected to host" mascot="sleep" />
			</Page>
		);
	}

	return (
		<Page
			className={`agent-sessions-page${embedded ? " is-sidebar-embedded" : ""}`}
			title={pageTitle}
			toolbarSlot={
				searchVisible ? (
					<PageSearchToolbar
						inputRef={searchInputRef}
						value={searchQuery}
						onChange={setSearchQuery}
						onDismiss={closeSearch}
						placeholder={`Search ${pageTitle}`}
						ariaLabel="Search sessions"
						closing={searchClosing}
					/>
				) : undefined
			}
			scrollRef={scrollRef}
			rightSlot={
				embedded ? undefined : (
				<>
					<button
						type="button"
						className="agent-sessions-header-btn haptic-trigger"
						data-active={searchVisible}
						onClick={toggleSearch}
						aria-label={searchOpen ? "Close search" : "Search sessions"}
					>
						<span
							className={searchOpen ? "icon-x" : "icon-search"}
							aria-hidden="true"
						/>
					</button>
					{!searchVisible && (
						<>
							{infoNote && (
								<button
									type="button"
									className="agent-sessions-header-btn haptic-trigger"
									onClick={() => setShowInfo(true)}
									aria-label={`About ${agent.title} sessions`}
								>
									<span className="icon-info" aria-hidden="true" />
								</button>
							)}
							<AppMenu
								ariaLabel="Project button"
								buttonClassName="agent-sessions-header-btn"
								items={[
									...(projects
										? projects.map((project) => ({
												label: project.name,
												icon: "icon-folder",
												key: project.path,
												onClick() {
													openNewChatForWorkspace(project.path);
												},
											}))
										: []),
									{
										label: "Add Project",
										icon: "icon-plus",
										async onClick() {
											const FileBrowserPage = await import("pages/files");
											pushPage(
												"select-project",
												<FileBrowserPage.default
													onSelectFolder={(path) => {
														addProject(path);
														openNewChatForWorkspace(path);
													}}
												/>,
											);
										},
									},
								]}
							>
								<span className="icon-plus" aria-hidden="true" />
							</AppMenu>
						</>
					)}
				</>
				)
			}
		>
			{embedded && (
				<div className="secondary-sidebar-page-controls">
					<select
						value={workspace ?? ""}
						onChange={(event) =>
							onWorkspaceChange?.(event.target.value || undefined)
						}
						aria-label="Session project scope"
						className="min-w-0 flex-1 truncate rounded border border-card-border bg-primary px-2 text-xs text-primary-text outline-none focus:border-accent"
					>
						<option value="">All Projects</option>
						{projects.map((project) => (
							<option key={project.path} value={project.path}>
								{project.name}
							</option>
						))}
					</select>
					<button
						type="button"
						className="agent-sessions-header-btn haptic-trigger"
						data-active={searchVisible}
						onClick={toggleSearch}
						aria-label={searchOpen ? "Close search" : "Search sessions"}
					>
						<span
							className={searchOpen ? "icon-x" : "icon-search"}
							aria-hidden="true"
						/>
					</button>
					<button
						type="button"
						className="agent-sessions-header-btn haptic-trigger"
						onClick={load}
						aria-label="Refresh sessions"
					>
						<span className="icon-refresh-cw" aria-hidden="true" />
					</button>
				</div>
			)}
			{(() => {
				if (loading) {
					return (
						<EmptyState
							mascot="loading"
							message={
								"Loading your sessions…\nThis may take a few seconds on first load."
							}
						/>
					);
				}

				if (error) {
					return (
						<EmptyState
							message={error}
							mascot="error"
							action={
								<button
									type="button"
									className="agent-sessions-retry"
									onClick={load}
								>
									Retry
								</button>
							}
						/>
					);
				}

				if (
					!mergedSessions.length &&
					!bookmarked.length &&
					!draftTabs.length
				) {
					return <EmptyState message={"No sessions found"} mascot="thinking" />;
				}

				return (
					<>
						{!filteredSessions.length &&
						!filteredBookmarks.length &&
						!filteredDraftTabs.length &&
						searchQuery.trim() ? (
							<EmptyState
								message="No sessions match your search"
								mascot="thinking"
							/>
						) : (
							<div className="agent-sessions-layout">
								{filteredDraftTabs.length > 0 && (
									<section className="agent-sessions-all-section">
										<div className="agent-sessions-section-header agent-sessions-section-header--list">
											<h2>Drafts</h2>
											<span className="agent-sessions-count">
												{filteredDraftTabs.length}
											</span>
										</div>
										<ul className="agent-sessions-list">
											{filteredDraftTabs.map((tab) => (
												<li
													key={tab.id}
													className="agent-sessions-item"
													data-active={tab.id === activeChatId}
												>
													<button
														type="button"
														className="agent-sessions-item-info haptic-trigger"
														aria-current={
															tab.id === activeChatId ? "page" : undefined
														}
														onClick={() =>
															openChat({
																tabId: tab.id,
																sessionId: "",
																title: tab.title,
																workspacePath: tab.projectPath,
															})
														}
													>
														<div className="agent-sessions-icon-wrap">
															<span className={agentIcon} aria-hidden="true" />
														</div>
														<div className="agent-sessions-text">
															<span className="agent-sessions-title">
																{tab.title}
															</span>
															<span className="agent-sessions-meta">
																{getBasename(tab.projectPath)} · draft
															</span>
														</div>
													</button>
												</li>
											))}
										</ul>
									</section>
								)}
								{filteredBookmarks.length > 0 && (
									<section className="agent-sessions-pinned-section">
										<button
											type="button"
											className="agent-sessions-section-header agent-sessions-section-header--button haptic-trigger"
											onClick={() => setBookmarkedExpanded((value) => !value)}
											aria-expanded={showBookmarkedCards}
										>
											<span
												className="icon-bookmark-filled"
												aria-hidden="true"
											/>
											<h2>Bookmarked</h2>
											<span className="agent-sessions-count">
												{filteredBookmarks.length}
											</span>
											<span
												className="agent-sessions-collapse-icon icon-chevron-down"
												aria-hidden="true"
											/>
										</button>
										{showBookmarkedCards && (
											<div className="agent-sessions-pinned-row">
												{filteredBookmarks.map((bookmark) => (
													<article
														key={`${bookmark.agentId}:${bookmark.sessionId}`}
														className="agent-sessions-pinned-card"
													>
														<button
															type="button"
															className="agent-sessions-pinned-card-main haptic-trigger"
															onClick={() => openBookmarkedSession(bookmark)}
														>
															<div className="agent-sessions-pinned-icon">
																<span
																	className={agentIcon}
																	aria-hidden="true"
																/>
															</div>
															<div className="agent-sessions-pinned-content">
																<span className="agent-sessions-pinned-title">
																	{bookmark.title}
																</span>
																<span className="agent-sessions-pinned-meta">
																	{getBookmarkedMeta(bookmark)}
																</span>
															</div>
														</button>
														<button
															type="button"
															className="agent-sessions-pinned-unbookmark haptic-trigger"
															onClick={(e) => {
																e.stopPropagation();
																togglePin({
																	agentId: backend,
																	sessionId: bookmark.sessionId,
																	title: bookmark.title,
																	workspacePath: bookmark.workspacePath,
																	updatedAt: bookmark.updatedAt,
																});
															}}
															aria-label="Remove bookmark"
														>
															<span
																className="icon-bookmark-filled"
																aria-hidden="true"
															/>
														</button>
													</article>
												))}
											</div>
										)}
									</section>
								)}

								{sessionGroups.length > 0 && (
									<section className="agent-sessions-all-section">
										{showSessionsHeader && (
											<div className="agent-sessions-section-header agent-sessions-section-header--list">
												<h2>Sessions</h2>
											</div>
										)}
										{sessionGroups.map((group) => (
											<div
												key={group.label}
												className="agent-sessions-date-group"
											>
												<h3>{group.label}</h3>
												<ul className="agent-sessions-list">
													{group.sessions.map((session, i) => (
												<li
													key={session.id ?? `${group.label}-${i}`}
													className="agent-sessions-item"
													data-active={
														session.id === activeSessionItem ||
														Boolean(
															session.id &&
																chatTabId(backend, session.id) === activeChatId,
														)
													}
												>
													<button
														type="button"
														className="agent-sessions-item-info haptic-trigger"
														aria-current={
															session.id &&
															chatTabId(backend, session.id) === activeChatId
																? "page"
																: undefined
														}
																onClick={() => openSession(session)}
															>
																<div className="agent-sessions-icon-wrap">
																	<span
																		className={agentIcon}
																		aria-hidden="true"
																	/>
																	{session.id &&
																		isBookmarked(backend, session.id) && (
																			<span
																				className="agent-sessions-icon-bookmark icon-bookmark-filled"
																				aria-hidden="true"
																			/>
																		)}
																</div>
																<div className="agent-sessions-text">
																	<span className="agent-sessions-title">
																		{session.title}
																	</span>
																	<span className="agent-sessions-meta">
																		{getMeta(session)}
																	</span>
																</div>
																{session.id &&
																	streamingSessions.has(session.id) && (
																		<span className="badge" />
																	)}
															</button>
															<AppMenu
																ariaLabel="Session menu"
																placement="bottom end"
																onToggle={(open) => {
																	if (open) {
																		setActiveSessionItem(session.id ?? "");
																	} else if (session.id === activeSessionItem) {
																		setActiveSessionItem(null);
																	}
																}}
																items={[
																	{
																		key: "bookmark",
																		icon:
																			session.id &&
																			isBookmarked(backend, session.id)
																				? "icon-bookmark-filled"
																				: "icon-bookmark",
																		label:
																			session.id &&
																			isBookmarked(backend, session.id)
																				? "Remove Bookmark"
																				: "Set Bookmark",
																		onClick: () => {
																			if (!session.id) {
																				return;
																			}

																			togglePin({
																				agentId: backend,
																				sessionId: session.id,
																				title: session.title ?? session.id,
																				workspacePath:
																					session.workspacePath ??
																					workspace ??
																					"",
																				updatedAt: session.updatedAt,
																			});
																		},
																	},
																	{
																		key: "copy-id",
																		icon: "icon-copy",
																		label: "Copy Session ID",
																		onClick: () => copySessionId(session.id),
																	},
																	{
																		key: "resume",
																		icon: "icon-terminal",
																		label: "Copy Resume Command",
																		onClick: () => copyResumeCommand(session),
																	},
																]}
															/>
														</li>
													))}
												</ul>
											</div>
										))}
									</section>
								)}
								{hasMoreSessions && (
									<div
										ref={sentinelRef}
										className="agent-sessions-sentinel"
										aria-hidden="true"
									/>
								)}
								{loadingMore && (
									<div className="agent-sessions-loading-more">
										<Loader />
									</div>
								)}
								{loadMoreError && (
									<div className="agent-sessions-load-more-error">
										<span>{loadMoreError}</span>
										<button type="button" onClick={loadMore}>
											Retry
										</button>
									</div>
								)}
							</div>
						)}
					</>
				);
			})()}
			{infoNote && (
				<BottomSheet
					open={showInfo}
					onClose={() => setShowInfo(false)}
					title={`About ${agent.title}`}
				>
					<p className="agent-sessions-info-note">{infoNote}</p>
				</BottomSheet>
			)}
		</Page>
	);
}

function appendUniqueSessions(current: AiSession[], next: AiSession[]) {
	const seen = new Set(current.map((session) => session.id));
	const merged = [...current];
	for (const session of next) {
		if (seen.has(session.id)) continue;
		seen.add(session.id);
		merged.push(session);
	}
	return merged;
}

function groupSessionsByDate(sessions: AiSession[]) {
	const groups: { label: string; sessions: AiSession[] }[] = [];
	const labelToGroup = new Map<string, (typeof groups)[number]>();

	for (const session of sessions) {
		const label = getDateGroupLabel(session.updatedAt ?? session.createdAt);
		const existing = labelToGroup.get(label);
		if (existing) {
			existing.sessions.push(session);
			continue;
		}

		const group = { label, sessions: [session] };
		groups.push(group);
		labelToGroup.set(label, group);
	}

	return groups;
}

function getDateGroupLabel(timestamp?: number) {
	if (!timestamp) return "Earlier";

	const date = new Date(timestamp);
	const today = new Date();
	const startOfToday = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	).getTime();
	const startOfDate = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	).getTime();
	const diffDays = Math.round((startOfToday - startOfDate) / 86_400_000);

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays > 1 && diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: today.getFullYear() === date.getFullYear() ? undefined : "numeric",
	});
}

function getBookmarkedMeta(bookmark: BookmarkedSession) {
	const meta: string[] = [];
	if (bookmark.workspacePath) {
		meta.push(bookmark.workspacePath.split("/").slice(-1)[0]);
	}
	if (bookmark.updatedAt) meta.push(formatRelativeTime(bookmark.updatedAt));
	return meta.join(" · ");
}

function writeBookmarkedExpanded(backend: AiBackend, expanded: boolean) {
	try {
		localStorage.setItem(
			getBookmarkedPreferenceKey(backend),
			expanded ? "expanded" : "collapsed",
		);
	} catch {
		// Ignore persistence failures; the in-memory state still works.
	}
}

function getBookmarkedPreferenceKey(backend: AiBackend) {
	return `agent-sessions:${backend}:bookmarked-expanded`;
}

function getMeta(session: AiSession) {
	const meta: string[] = [];

	if (session.workspacePath) {
		meta.push(session.workspacePath.split("/").slice(-1)[0]);
	}

	if (session.model) {
		meta.push(session.model);
	}

	if (session.updatedAt) meta.push(formatRelativeTime(session.updatedAt));

	return meta.join(" · ");
}

function getBasename(path: string) {
	return path.split("/").filter(Boolean).slice(-1)[0] || path;
}

function getResumeCommand(
	backend: AiBackend,
	sessionId: string,
	workspacePath?: string,
): string {
	const cd = workspacePath ? `cd ${workspacePath} && ` : "";
	switch (backend) {
		case "claude-code":
			return `${cd}claude --resume ${sessionId}`;
		case "codex":
			return `${cd}codex resume ${sessionId}`;
		case "opencode":
			return `${cd}opencode --session ${sessionId}`;
		case "copilot":
			return `${cd}copilot --resume=${sessionId}`;
		case "cursor":
			return `${cd}cursor-agent --resume ${sessionId}`;
		case "pi":
			return `${cd}pi --resume ${sessionId}`;
		case "hermes":
			return `${cd}hermes --resume ${sessionId}`;
		default:
			return `Session: ${sessionId}`;
	}
}
