import "./style.scss";
import { pushPage } from "App";
import type { HostInfo } from "@shellular/protocol";
import clsx from "clsx";
import OfflineBanner from "components/OfflineBanner";
import Scanner from "components/Scanner";
import { AnimatePresence, motion } from "framer-motion";
import { getAgentIcon } from "lib/agents";
import { getOnlineStatus } from "lib/utils";
import { useEffect, useState } from "react";
import { useShellular } from "state";
import { getHostInfo } from "state/connection";
import {
	getActiveSessionActivities,
	type SessionActivity,
	subscribeSessionActivities,
} from "state/sessions";
import ConnectionInfo from "./ConnectionInfo";
import SavedHostItem from "./SavedHostItem";

export default function HomeTab() {
	const { savedHosts, connectionStatus, isSwitching, agents } = useShellular();
	const [showScanner, setShowScanner] = useState(false);
	const [hostInfo, setHostInfo] = useState<HostInfo | null>(getHostInfo);
	const [isOnline, setIsOnline] = useState<boolean>(getOnlineStatus);
	const [activeSessions, setActiveSessions] = useState<SessionActivity[]>(
		getActiveSessionActivities(),
	);
	const compact = savedHosts.length > 0;
	const visibleActiveSessions = activeSessions.filter(
		(session) => agents[session.agentId]?.available,
	);

	useEffect(() => {
		if (connectionStatus !== "connected" && !isSwitching) {
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

		if (connectionStatus === "connected") {
			setHostInfo(getHostInfo());
		}
	}, [connectionStatus, isSwitching]);

	useEffect(() => {
		const refresh = () => setActiveSessions(getActiveSessionActivities());
		refresh();
		return subscribeSessionActivities(refresh);
	}, []);

	return (
		<div className="home-tab">
			<div className="home-hero">
				<div className="home-hero-brand">
					<span className="icon-shellular" aria-hidden="true" />
					<h1>Shellular</h1>
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

			<div className={clsx("px-4 py-12", { hidden: isOnline })}>
				<OfflineBanner onChange={setIsOnline} />
			</div>
			{isOnline && hostInfo && <ConnectionInfo hostInfo={hostInfo} />}
			{isOnline && hostInfo && visibleActiveSessions.length > 0 && (
				<div className="home-active-sessions">
					<h2 className="home-section-title">Active Sessions</h2>
					<ul className="home-active-sessions-list">
						{visibleActiveSessions.map((session) => {
							const agent = agents[session.agentId];
							return (
								<li key={`${session.agentId}:${session.sessionId}`}>
									<button
										type="button"
										className="home-active-session haptic-trigger"
										onClick={() => openSession(session, agent)}
									>
										<span
											className={`home-active-session-icon ${getAgentIcon(session.agentId)}`}
											aria-hidden="true"
										/>
										<span className="home-active-session-text">
											<span className="home-active-session-title">
												{session.title || session.sessionId}
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
									</button>
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

			{savedHosts.length > 0 &&
				!showScanner &&
				connectionStatus !== "connected" && (
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
		</div>
	);
}

async function openSession(
	session: SessionActivity,
	agent?: ReturnType<typeof useShellular>["agents"][string],
) {
	const ChatConversationPage = await import("pages/chat");
	pushPage(
		`${session.agentId}-${session.sessionId}`,
		<ChatConversationPage.default
			sessionId={session.sessionId}
			title={session.title || session.sessionId}
			agentId={session.agentId}
			workspacePath={session.workspacePath ?? ""}
			assistantName={agent?.name ?? session.agentId}
			agentAvailable={agent?.available ?? true}
			unavailableMessage={`${agent?.name ?? session.agentId} is not available on this device.`}
			providerName={agent?.title ?? session.agentId}
			agentCapabilities={agent?.capabilities}
		/>,
	);
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
