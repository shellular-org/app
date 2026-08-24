import "pages/sessions/style.scss";
import AppMenu from "components/AppMenu";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { getAgentIcon } from "lib/agents";
import { openChatPage } from "lib/navigate";
import { formatRelativeTime } from "lib/utils";
import { useCallback } from "react";
import { useShellular } from "state";
import {
	type BookmarkedSession,
	useBookmarkedSessions,
} from "state/bookmarkSessions";

/**
 * Global bookmarked-chats view, pushed from the Agents tab. Lists every bookmarked
 * session across all agents. The per-agent sessions page filters in place
 * instead of using this page.
 */
export default function BookmarkSessionsPage({
	embedded = false,
	onNavigate,
}: {
	embedded?: boolean;
	onNavigate?: () => void;
} = {}) {
	const { agents } = useShellular();
	const { bookmarked, toggleBookmark } = useBookmarkedSessions();
	const visibleBookmarks = bookmarked.filter(
		(bookmark) => agents[bookmark.agentId]?.available,
	);

	const openSession = useCallback(
		async (bookmark: BookmarkedSession) => {
			const agent = agents[bookmark.agentId];
			if (!agent?.available) return;
			await openChatPage({
				agentId: bookmark.agentId,
				agent,
				sessionId: bookmark.sessionId,
				title: bookmark.title,
				workspacePath: bookmark.workspacePath,
			});
			onNavigate?.();
		},
		[agents, onNavigate],
	);

	return (
		<Page
			className={`agent-sessions-page${embedded ? " is-sidebar-embedded" : ""}`}
			title="Bookmarked"
		>
			{!visibleBookmarks.length ? (
				<EmptyState message="No bookmarked chats yet" mascot="thinking" />
			) : (
				<ul className="agent-sessions-list">
					{visibleBookmarks.map((bookmark) => {
						const agent = agents[bookmark.agentId];
						return (
							<li
								key={`${bookmark.agentId}:${bookmark.sessionId}`}
								className="agent-sessions-item"
							>
								<button
									type="button"
									className="agent-sessions-item-info"
									onClick={() => openSession(bookmark)}
								>
									<div className="agent-sessions-icon-wrap">
										<span
											className={getAgentIcon(bookmark.agentId)}
											aria-hidden="true"
										/>
									</div>
									<div className="agent-sessions-text">
										<span className="agent-sessions-title">
											{bookmark.title}
										</span>
										<span className="agent-sessions-meta">
											{getMeta(bookmark, agent?.title)}
										</span>
									</div>
								</button>
								<AppMenu
									ariaLabel="Bookmarked chat menu"
									placement="bottom end"
									items={[
										{
											key: "remove-bookmark",
											icon: "icon-bookmark-filled",
											label: "Remove Bookmark",
											onClick: () =>
												toggleBookmark({
													agentId: bookmark.agentId,
													sessionId: bookmark.sessionId,
													title: bookmark.title,
													workspacePath: bookmark.workspacePath,
													updatedAt: bookmark.updatedAt,
												}),
										},
									]}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</Page>
	);
}

function getMeta(bookmark: BookmarkedSession, agentTitle?: string): string {
	const meta: string[] = [];
	if (agentTitle) meta.push(agentTitle);
	if (bookmark.workspacePath) {
		meta.push(bookmark.workspacePath.split("/").slice(-1)[0]);
	}
	if (bookmark.updatedAt) meta.push(formatRelativeTime(bookmark.updatedAt));
	return meta.join(" · ");
}
