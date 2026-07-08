import "./style.scss";
import { pushPage } from "App";
import type { HostInfo } from "@shellular/protocol";
import clsx from "clsx";
import AppMenu from "components/AppMenu";
import NoticeDialog from "components/NoticeDialog";
import OfflineBanner from "components/OfflineBanner";
import RatingDialog from "components/RatingDialog";
import Scanner from "components/Scanner";
import { AnimatePresence, motion } from "framer-motion";
import { getAgentIcon } from "lib/agents";
import { useAuth } from "lib/auth";
import { chatTabId } from "lib/chatTabId";
import { copyToClipboard } from "lib/clipboard";
import { dismissNotice, getUndismissedNotices, type Notice } from "lib/notices";
import { shouldPromptForRating } from "lib/ratingService";
import { getOnlineStatus } from "lib/utils";
import AccountPage from "pages/account";
import { useEffect, useState } from "react";
import { useShellular } from "state";
import { getHostInfo } from "state/connection";
import {
	dismissSessionActivity,
	getActiveSessionActivities,
	type SessionActivity,
	subscribeSessionActivities,
} from "state/sessions";
import ConnectionInfo from "./ConnectionInfo";
import SavedHostItem from "./SavedHostItem";

export default function HomeTab() {
	const { savedHosts, connectionStatus, isSwitching, agents } = useShellular();
	const { user } = useAuth();
	// Treat an in-flight reconnect as "still connected" for display purposes, so
	// a dropped CLI doesn't visually reset the home view to the host picker while
	// we're transparently retrying. The reconnect overlay communicates the state.
	const isLive =
		connectionStatus === "connected" || connectionStatus === "reconnecting";
	const [showScanner, setShowScanner] = useState(false);
	const [hostInfo, setHostInfo] = useState<HostInfo | null>(getHostInfo);
	const [isOnline, setIsOnline] = useState<boolean>(getOnlineStatus);
	const [activeSessions, setActiveSessions] = useState<SessionActivity[]>(
		getActiveSessionActivities(),
	);
	const [showRatingDialog, setShowRatingDialog] = useState(false);
	const [noticeQueue, setNoticeQueue] = useState<Notice[]>([]);
	const notice = noticeQueue[0] ?? null;
	const compact = savedHosts.length > 0;
	const visibleActiveSessions = activeSessions.filter(
		(session) => agents[session.agentId]?.available,
	);

	useEffect(() => {
		// Keep the last host info on screen during a reconnect (isLive) so the
		// view doesn't collapse; only clear it once we're truly disconnected.
		if (!isLive && !isSwitching) {
			setHostInfo(null);
			return;
		}

		if (connectionStatus === "connecting") {
			const timeout = setTimeout(() => {
				if (connectionStatus === "connecting") {
					setHostInfo(null);
				} else {
					setHostInfo(getHostInfo());
				}
			}, 300);

			return () => clearTimeout(timeout);
		}

		if (isLive) {
			setHostInfo(getHostInfo());
		}
	}, [connectionStatus, isLive, isSwitching]);

	useEffect(() => {
		const refresh = () => setActiveSessions(getActiveSessionActivities());
		refresh();
		return subscribeSessionActivities(refresh);
	}, []);

	useEffect(() => {
		let active = true;
		getUndismissedNotices().then((notices) => {
			if (active) setNoticeQueue(notices);
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (connectionStatus === "connected" && process.env.PLATFORM === "ios") {
			shouldPromptForRating().then((should) => {
				if (should) {
					setShowRatingDialog(true);
				}
			});
		}
	}, [connectionStatus]);

	return (
		<div className="home-tab">
			<div className="home-hero">
				<div className="home-hero-brand">
					<span className="icon-shellular" aria-hidden="true" />
					<h1>Shellular</h1>
					<span className="home-hero-beta-badge">Beta</span>
				</div>
				{isOnline && !hostInfo && compact && (
					<motion.button
						type="button"
						className="home-hero-scanner-btn"
						onClick={() => setShowScanner(true)}
						aria-label="Scan QR code"
						animate={{
							opacity: showScanner ? 0 : 1,
							scale: showScanner ? 0.9 : 1,
						}}
						transition={{ duration: 0.2, ease: "easeOut" }}
						style={{ pointerEvents: showScanner ? "none" : "auto" }}
					>
						<span className="icon-qr_code_scanner" aria-hidden="true" />
						<span>Scan</span>
					</motion.button>
				)}
			</div>

			<div className={clsx("px-4", { hidden: isOnline })}>
				<OfflineBanner onChange={setIsOnline} />
			</div>
			{user && (
				<section className="home-account-section">
					<button
						type="button"
						className="home-account-card haptic-trigger"
						onClick={openAccountPage}
					>
						<span className="home-account-avatar" aria-hidden="true">
							{user.avatarUrl ? (
								<img src={user.avatarUrl} alt="" />
							) : (
								<span className="icon-user" />
							)}
						</span>
						<span className="home-account-text">
							<span className="home-account-name">
								{user.name || user.email}
							</span>
							<span className="home-account-email">{user.email}</span>
							<span className="home-account-status">Signed in</span>
						</span>
						<span
							className="icon-chevron-right home-account-chevron"
							aria-hidden="true"
						/>
					</button>
				</section>
			)}
			{isOnline && hostInfo && <ConnectionInfo hostInfo={hostInfo} />}
			{isOnline && hostInfo && visibleActiveSessions.length > 0 && (
				<div className="home-active-sessions">
					<h2 className="home-section-title">Active Sessions</h2>
					<ul className="home-active-sessions-list">
						{visibleActiveSessions.map((session) => {
							const agent = agents[session.agentId];
							const dismissible = isDismissible(session);
							return (
								<li
									key={`${session.agentId}:${session.sessionId}`}
									className="home-active-session-row"
								>
									<div
										className="home-active-session haptic-trigger"
										onClick={() => openSession(session, agent)}
									>
										<span
											className={`home-active-session-icon ${getAgentIcon(session.agentId)}`}
											aria-hidden="true"
										/>
										<span className="home-active-session-text">
											<span className="home-active-session-title">
												{sessionDisplayTitle(session)}
											</span>
											<span className="home-active-session-meta">
												{[
													agent?.title ?? session.agentId,
													basename(session.workspacePath),
												]
													.filter(Boolean)
													.join(" · ")}
											</span>
										</span>
										<div
											className="home-active-session-status"
											data-status={session.status}
										>
											<span
												className={`home-active-session-icon ${getAgentIcon(session.agentId)}`}
												aria-hidden="true"
											/>
											<span className="home-active-session-text">
												<span className="home-active-session-title">
													{sessionDisplayTitle(session)}
												</span>
												<span className="home-active-session-meta">
													{[
														agent?.title ?? session.agentId,
														basename(session.workspacePath),
													]
														.filter(Boolean)
														.join(" · ")}
												</span>
											</span>
											<span
												className="home-active-session-status"
												data-status={session.status}
											>
												{statusLabel(session)}
											</span>
										</div>
										{dismissible && (
											<AppMenu
												ariaLabel="Session options"
												buttonClassName="home-active-session-menu"
												placement="bottom end"
												items={[
													{
														key: "copy-id",
														icon: "icon-copy",
														label: "Copy Session ID",
														onClick: () => copySessionId(session.sessionId),
													},
													{
														key: "dismiss",
														icon: "icon-eye-off",
														label: "Dismiss",
														onClick: () =>
															dismissSessionActivity(
																session.agentId,
																session.sessionId,
															),
													},
												]}
											/>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			)}
			<AnimatePresence mode="popLayout">
				{isOnline && !hostInfo && (!compact || showScanner) && (
					<motion.div
						key="home-scanner"
						style={{ flex: 1, display: "flex", flexDirection: "column" }}
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.25, ease: "easeInOut" }}
					>
						<Scanner
							compact={compact}
							showScanner={showScanner}
							setShowScanner={setShowScanner}
						/>
					</motion.div>
				)}
			</AnimatePresence>

			{savedHosts.length > 0 && !showScanner && !isLive && (
				<div className="saved-machines-section">
					<h2 className="saved-machines-title">Recent Hosts</h2>
					<div className="saved-machines-list">
						<AnimatePresence mode="popLayout">
							{savedHosts.map((host) => (
								<motion.div
									key={host.hostId}
									layout
									initial={{ opacity: 0, y: -10 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -10 }}
									className="saved-machines-list"
									transition={{ type: "spring", stiffness: 300, damping: 30 }}
								>
									<SavedHostItem host={host} />
								</motion.div>
							))}
						</AnimatePresence>
					</div>
				</div>
			)}
			<RatingDialog
				isOpen={showRatingDialog}
				onClose={() => setShowRatingDialog(false)}
			/>
			<NoticeDialog
				notice={notice}
				onDismiss={(id) => {
					dismissNotice(id);
					// Drop this notice and reveal the next one in the queue, if any.
					setNoticeQueue((queue) => queue.filter((n) => n.id !== id));
				}}
			/>
		</div>
	);
}

function openAccountPage() {
	pushPage("account", <AccountPage />, { showConnectionBanner: false });
}

async function openSession(
	session: SessionActivity,
	agent?: ReturnType<typeof useShellular>["agents"][string],
) {
	const agentName = agent?.name ?? session.agentId;
	const tabId = chatTabId(session.agentId, session.sessionId);
	const ChatConversationPage = await import("pages/chat");
	pushPage(
		tabId,
		<ChatConversationPage.default
			chatTabId={tabId}
			sessionId={session.sessionId}
			title={sessionDisplayTitle(session)}
			agentId={session.agentId}
			workspacePath={session.workspacePath ?? ""}
			assistantName={agentName}
			agentAvailable={agent?.available ?? true}
			unavailableMessage={`${agentName} is not available on this device.`}
			providerName={agent?.title ?? session.agentId}
			agentCapabilities={agent?.capabilities}
		/>,
	);
}

function copySessionId(sessionId: string) {
	copyToClipboard({
		text: sessionId,
		successMessage: "Session ID copied",
	});
}

function sessionDisplayTitle(session: SessionActivity): string {
	if (session.title) return session.title;
	// Fall back to the workspace folder name rather than the raw session id,
	// which is an opaque UUID and not user-friendly.
	const folder = basename(session.workspacePath);
	return folder || session.sessionId;
}

function isDismissible(session: SessionActivity): boolean {
	// Only allow dismissing sessions that aren't actively doing something or
	// waiting on the user; live ones should stay until they resolve.
	switch (session.status) {
		case "starting":
		case "running":
		case "waiting_for_permission":
		case "stopping":
			return false;
		default:
			return true;
	}
}

function statusLabel(session: SessionActivity) {
	switch (session.status) {
		case "starting":
			return "Starting";
		case "running":
			return "Working";
		case "waiting_for_permission":
			return "Permission";
		case "stopping":
			return "Stopping";
		case "stopped":
			return "Stopped";
		case "cancelled":
			return "Cancelled";
		case "error":
			return "Error";
		default:
			return "Finished";
	}
}

function basename(path?: string) {
	return path?.split("/").filter(Boolean).slice(-1)[0] ?? "";
}
