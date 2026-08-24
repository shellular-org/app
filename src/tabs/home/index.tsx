import "./style.scss";
import { pushPage } from "App";
import type { HostInfo } from "@shellular/protocol";
import clsx from "clsx";
import AccountAvatarButton from "components/AccountAvatarButton";
import AppMenu from "components/AppMenu";
import NoticeDialog from "components/NoticeDialog";
import OfflineBanner from "components/OfflineBanner";
import RatingDialog from "components/RatingDialog";
import Scanner from "components/Scanner";
import SemanticStatusIcon from "components/SemanticStatusIcon";
import StartupBanner from "components/StartupBanner";
import { AnimatePresence, domMax, LazyMotion, m } from "framer-motion";
import { getAgentIcon } from "lib/agents";
import { copyToClipboard } from "lib/clipboard";
import { openChatPage } from "lib/navigate";
import { dismissNotice, getUndismissedNotices, type Notice } from "lib/notices";
import { shouldPromptForRating } from "lib/ratingService";
import { getResumeCommand } from "lib/resumeCommand";
import { getOnlineStatus } from "lib/utils";
import AccountPage from "pages/account";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useShellular } from "state";
import {
	getConnectionSnapshot,
	getHostInfo,
	subscribeState,
} from "state/connection";
import {
	connectLocalCli,
	getLocalCliSnapshot,
	subscribeLocalCli,
} from "state/localCli";
import {
	dismissSessionActivity,
	getActiveSessionActivities,
	type SessionActivity,
	subscribeSessionActivities,
} from "state/sessions";
import { tryOpenUtilitySurface } from "workbench/openers";
import ConnectionInfo from "./ConnectionInfo";
import SavedHostItem from "./SavedHostItem";
import { getSessionStatusPresentation } from "./sessionStatusPresentation";

export default function HomeTab({
	showAccount = true,
}: {
	showAccount?: boolean;
}) {
	const {
		savedHosts,
		connectionStatus,
		isSwitching,
		agents,
		disconnect,
		hostPlatform,
	} = useShellular();
	const connection = useSyncExternalStore(
		subscribeState,
		getConnectionSnapshot,
	);
	const localCli = useSyncExternalStore(subscribeLocalCli, getLocalCliSnapshot);
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
	const isLocalConnection = isLive && connection.transport === "local";

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
		<LazyMotion features={domMax}>
			<div className="home-tab">
				{!process.env.IS_DESKTOP_UI && (
					<div className="home-hero">
						<div className="home-hero-brand">
							<span className="icon-shellular" aria-hidden="true" />
							<h1>Shellular</h1>
							<span className="home-hero-beta-badge">Beta</span>
						</div>
						{showAccount && <AccountAvatarButton onClick={openAccountPage} />}
					</div>
				)}

				<div className={clsx("px-4", { hidden: isOnline })}>
					<OfflineBanner onChange={setIsOnline} />
				</div>
				<StartupBanner />
				{isOnline && hostInfo && (
					<div
						className={clsx(
							process.env.IS_DESKTOP_UI &&
								"pt-[var(--workbench-sidebar-gutter,18px)]",
						)}
					>
						{isLocalConnection ? (
							<LocalConnectionInfo onDisconnect={disconnect} />
						) : (
							<ConnectionInfo hostInfo={hostInfo} />
						)}
					</div>
				)}
				{isOnline && hostInfo && visibleActiveSessions.length > 0 && (
					<div className="px-[var(--workbench-sidebar-gutter,18px)] pt-0.5 pb-[var(--workbench-sidebar-gutter,18px)]">
						<h2 className="mb-2.5 ml-1 text-[11px] font-bold uppercase tracking-[0.9px] text-secondary-text opacity-45">
							Active Sessions
						</h2>
						<ul className="m-0 flex list-none flex-col gap-2 p-0">
							{visibleActiveSessions.map((session) => {
								const agent = agents[session.agentId];
								const dismissible = isDismissible(session);
								const status = getSessionStatusPresentation(session.status);
								return (
									<li
										key={`${session.agentId}:${session.sessionId}`}
										className="flex items-center rounded-xl border border-card-border bg-popup-background shadow-[var(--shadow)] transition-colors duration-150 active:bg-[color-mix(in_srgb,var(--info)_8%,transparent)]"
									>
										<button
											type="button"
											className="haptic-trigger flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 pr-1 text-left"
											onClick={() => openSession(session, agent)}
										>
											<span
												className={`shrink-0 text-[22px] ${getAgentIcon(session.agentId)}`}
												aria-hidden="true"
											/>
											<span className="flex min-w-0 flex-1 flex-col gap-0.5">
												<span className="truncate text-[14px] font-[650] text-primary-text">
													{sessionDisplayTitle(session)}
												</span>
												<span className="card-subtext truncate text-[11px]">
													{[
														agent?.title ?? session.agentId,
														basename(session.workspacePath),
													]
														.filter(Boolean)
														.join(" · ")}
												</span>
											</span>
										</button>
										<div
											className={clsx(
												"flex shrink-0 items-center gap-1",
												dismissible ? "pr-1.5" : "pr-3",
											)}
										>
											<SemanticStatusIcon
												icon={status.icon}
												label={status.label}
												tone={status.tone}
												animated={status.animated}
												className="pointer-events-none"
											/>
											<AppMenu
												ariaLabel="Session options"
												buttonClassName="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md bg-surface-soft text-secondary-text hover:bg-surface-strong hover:text-primary-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
												placement="bottom end"
												items={[
													{
														key: "copy-id",
														icon: "icon-copy",
														label: "Copy Session ID",
														onClick: () => copySessionId(session.sessionId),
													},
													{
														key: "resume",
														icon: "icon-terminal",
														label: "Copy Resume Command",
														onClick: () =>
															copyResumeCommand(session, hostPlatform),
													},
													...(dismissible
														? [
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
															]
														: []),
												]}
											>
												<span
													className="icon-more-horizontal text-[14px] leading-none"
													aria-hidden="true"
												/>
											</AppMenu>
										</div>
									</li>
								);
							})}
						</ul>
					</div>
				)}
				<AnimatePresence mode="popLayout">
					{isOnline && !hostInfo && (!compact || showScanner) && (
						<m.div
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
						</m.div>
					)}
				</AnimatePresence>
				{localCli.capability?.available && !isLive && (
					<div className="saved-machines-section">
						<h2 className="saved-machines-title">This Machine</h2>
						<button
							type="button"
							className="flex w-full items-center gap-3 rounded-xl border border-card-border bg-popup-background p-3 text-left shadow-[var(--shadow)]"
							onClick={() => void connectLocalCli()}
						>
							<span
								className="icon-shellular before:!text-current text-xl"
								aria-hidden="true"
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-bold text-primary-text">
									{localCli.cli?.machineName ?? "This Mac"}
								</span>
								<span className="card-subtext block truncate text-[11px]">
									{localCli.busy
										? localCli.phase === "connecting"
											? "Connecting…"
											: "Preparing local access…"
										: (localCli.error ??
											`Local · ${localCli.cli?.directory ?? "available"}`)}
								</span>
							</span>
							<span
								className="icon-chevron_right opacity-40"
								aria-hidden="true"
							/>
						</button>
					</div>
				)}

				{savedHosts.length > 0 && !showScanner && !isLive && (
					<div className="saved-machines-section">
						<div className="mb-2.5 ml-1 flex items-center justify-between">
							<h2 className="saved-machines-title !m-0">Recent Hosts</h2>
							{isOnline && !hostInfo && (
								<button
									type="button"
									className="home-hero-scanner-btn"
									onClick={() => setShowScanner(true)}
									aria-label="Scan QR code to connect a new host"
								>
									<span className="icon-qr_code_scanner" aria-hidden="true" />
									<span>Add</span>
								</button>
							)}
						</div>
						<div className="saved-machines-list">
							<AnimatePresence mode="popLayout">
								{savedHosts.map((host) => (
									<m.div
										key={host.hostId}
										layout
										initial={{ opacity: 0, y: -10 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -10 }}
										className="saved-machines-list"
										transition={{ type: "spring", stiffness: 300, damping: 30 }}
									>
										<SavedHostItem host={host} />
									</m.div>
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
		</LazyMotion>
	);
}

function openAccountPage() {
	if (tryOpenUtilitySurface("account", "Account", "icon-user")) return;
	pushPage("account", <AccountPage />, { showConnectionBanner: false });
}

function LocalConnectionInfo({ onDisconnect }: { onDisconnect: () => void }) {
	return (
		<section className="local-connection-card" aria-label="Local workspace">
			<div className="local-connection-icon">
				<span className="icon-monitor" aria-hidden="true" />
			</div>
			<div className="local-connection-copy">
				<span>{localMachineLabel()}</span>
				<small>Working locally on this computer</small>
			</div>
			<button
				type="button"
				className="local-connection-exit"
				onClick={onDisconnect}
				aria-label="Leave local workspace"
				title="Leave local workspace"
			>
				<span className="icon-log-out" aria-hidden="true" />
			</button>
		</section>
	);
}

function localMachineLabel() {
	if (process.env.PLATFORM === "macos") return "This Mac";
	const platform = navigator.platform.toLowerCase();
	const userAgent = navigator.userAgent.toLowerCase();
	if (platform.includes("win") || userAgent.includes("windows"))
		return "This PC";
	if (platform.includes("linux") || userAgent.includes("linux")) {
		return "This Computer";
	}
	return "This Computer";
}

async function openSession(
	session: SessionActivity,
	agent?: ReturnType<typeof useShellular>["agents"][string],
) {
	await openChatPage({
		agentId: session.agentId,
		agent,
		sessionId: session.sessionId,
		title: sessionDisplayTitle(session),
		workspacePath: session.workspacePath ?? "",
	});
}

function copySessionId(sessionId: string) {
	copyToClipboard({
		text: sessionId,
		successMessage: "Session ID copied",
	});
}

function copyResumeCommand(session: SessionActivity, platform?: string) {
	copyToClipboard({
		text: getResumeCommand(
			session.agentId,
			session.sessionId,
			session.workspacePath,
			platform,
		),
		successMessage: "Resume command copied",
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

function basename(path?: string) {
	return path?.split("/").filter(Boolean).slice(-1)[0] ?? "";
}
