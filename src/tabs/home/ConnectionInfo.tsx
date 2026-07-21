import "./ConnectionInfo.scss";
import { pushPage } from "App";
import {
	type AiBackend,
	type HostUpdateResultMsg,
	MsgType,
} from "@shellular/protocol";
import dialog from "bridge/dialog";
import AgentIcon from "components/AgentIcon";
import Mascot from "components/Mascot";
import appConfig from "lib/appConfig";
import toast from "lib/toast";
import { getPlatformIcon } from "lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShellular } from "state";
import {
	type ConnectedHostInfo,
	onMessage,
	sendMessage,
	setHostUpdating,
} from "state/connection";

const COLLAPSED_AGENT_COUNT = 5;

export default function ConnectionInfo({
	hostInfo,
}: {
	hostInfo: ConnectedHostInfo;
}) {
	const { serverUrl, disconnect, batteryInfo, agents } = useShellular();
	const [agentsExpanded, setAgentsExpanded] = useState(false);
	const availableAgents = Object.values(agents).filter(
		(agent) => agent.available,
	);
	const visibleAgents = useMemo(
		() =>
			agentsExpanded
				? availableAgents
				: availableAgents.slice(0, COLLAPSED_AGENT_COUNT),
		[agentsExpanded, availableAgents],
	);
	const hiddenAgentCount = availableAgents.length - visibleAgents.length;

	const openSysmon = useCallback(async () => {
		const SysmonPage = await import("pages/sysmon");
		pushPage("system-monitor", <SysmonPage.default />);
	}, []);

	const onDisconnect = useCallback(async () => {
		const ok = await dialog.confirm(
			"Disconnect from the remote machine?",
			"Disconnect",
		);
		if (ok) disconnect();
	}, [disconnect]);

	const [updating, setUpdating] = useState(false);

	// Surface self-update progress reported by the CLI. The socket drops while
	// the CLI restarts; the existing reconnect logic re-establishes the session
	// and a fresh cliVersion arrives, clearing `updateAvailable`.
	useEffect(() => {
		const unsubscribe = onMessage<HostUpdateResultMsg>(
			MsgType.HOST_UPDATE_RESULT,
			(msg) => {
				switch (msg.data.status) {
					case "starting":
					case "updating":
						setUpdating(true);
						setHostUpdating(true);
						toast("Updating CLI…");
						break;
					case "restarting":
						setUpdating(true);
						setHostUpdating(true);
						toast("CLI is updating and restarting…", 4000);
						break;
					case "error":
						setUpdating(false);
						setHostUpdating(false);
						toast(
							`Update failed: ${msg.data.message ?? "unknown error"}`,
							4000,
						);
						break;
				}
			},
		);
		return unsubscribe;
	}, []);

	const onUpdateCli = useCallback(async () => {
		const target = hostInfo.latestCliVersion
			? `to v${hostInfo.latestCliVersion}`
			: "to the latest version";
		const ok = await dialog.confirm(
			`Update the Shellular CLI on ${hostInfo.hostname} ${target} and restart it? The connection will briefly drop while it restarts.`,
			"Update CLI",
		);
		if (!ok) return;

		setUpdating(true);
		// Set this up front rather than waiting for the CLI's first status
		// message — the socket can drop before it arrives, and the reconnect
		// overlay needs to know the restart is expected.
		setHostUpdating(true);
		toast("Requesting CLI update…");
		sendMessage({ type: MsgType.HOST_UPDATE, data: {} });
	}, [hostInfo.hostname, hostInfo.latestCliVersion]);

	// When the CLI can't self-update (foreground npx/global launch), surface the
	// manual-update instructions in a popup instead of taking up inline space.
	const onShowUpdateInfo = useCallback(() => {
		const version = hostInfo.latestCliVersion
			? `v${hostInfo.latestCliVersion}`
			: "a newer version";
		dialog.message(
			`${version} of the Shellular CLI is available, but this host can't update itself (it wasn't started as a daemon).\n\nUpdate it manually by running:\n\nnpx shellular@latest\n\nOr, if you installed it globally:\n\nnpm i -g shellular@latest`,
			"Update available",
		);
	}, [hostInfo.latestCliVersion]);

	const openSessions = useCallback(
		async (backend: AiBackend) => {
			const ChatSessionsPage = await import("pages/sessions");
			pushPage(
				`ai-${backend}`,
				<ChatSessionsPage.default backend={backend} agent={agents[backend]} />,
			);
		},
		[agents],
	);

	return (
		<div className="connection-info">
			<div className="connection-status-badge">
				<Mascot state="success" size={22} tone="inline" label="Connected" />
				<span>Connected</span>

				<button
					type="button"
					className="connection-icon-btn"
					onClick={openSysmon}
					aria-label="System Monitor"
				>
					<span className="icon-activity" aria-hidden="true" />
				</button>
				<button
					type="button"
					className="connection-disconnect-btn danger"
					onClick={onDisconnect}
					aria-label="Disconnect"
				>
					<span className="icon-log-out" aria-hidden="true" />
				</button>
			</div>
			<div className="connection-details-group">
				<div className="connection-row">
					<span
						className={`${getPlatformIcon(hostInfo.platform)} connection-icon`}
						aria-hidden="true"
					/>
					<div className="connection-details">
						<span className="connection-label">Host</span>
						<span className="connection-value">
							{hostInfo.username}@{hostInfo.hostname}
						</span>
					</div>
				</div>
				<div className="connection-row">
					<span className="icon-folder connection-icon" aria-hidden="true" />
					<div className="connection-details">
						<span className="connection-label">Directory</span>
						<span className="connection-value">{hostInfo.dir}</span>
					</div>
				</div>

				{(process.env.DEV_MODE ||
					serverUrl !== `https://${appConfig.DEFAULT_SERVER}`) && (
					<div className="connection-row">
						<span className="icon-globe connection-icon" aria-hidden="true" />
						<div className="connection-details">
							<span className="connection-label">Server</span>
							<span className="connection-value">{serverUrl}</span>
						</div>
					</div>
				)}
				{batteryInfo && (
					<div className="connection-row">
						<span className="icon-battery connection-icon" aria-hidden="true" />
						<div className="connection-details">
							<span className="connection-label">Battery</span>
							<span className="connection-value">
								{batteryInfo.percentage}%
								{batteryInfo.charging ? " · Charging" : ""}
							</span>
						</div>
					</div>
				)}
				{hostInfo.cliVersion && (
					<div className="connection-row connection-row--stack">
						<div className="connection-row-main">
							<span
								className="icon-terminal connection-icon"
								aria-hidden="true"
							/>
							<div className="connection-details">
								<span className="connection-label">CLI Version</span>
								<div className="connection-value">
									v{hostInfo.cliVersion}
									{hostInfo.updateAvailable && hostInfo.latestCliVersion && (
										<span className="connection-update-hint">
											{" "}
											(v{hostInfo.latestCliVersion} available)
										</span>
									)}
									{hostInfo.updateAvailable && !hostInfo.latestCliVersion && (
										<span className="connection-update-hint">
											{" "}
											(update available)
										</span>
									)}
								</div>
							</div>
						</div>
						{hostInfo.updateAvailable &&
							(hostInfo.canSelfUpdate ? (
								<button
									type="button"
									className="connection-update-link"
									onClick={onUpdateCli}
									disabled={updating}
								>
									{updating ? "Updating…" : "Update"}
								</button>
							) : (
								<button
									type="button"
									className="connection-update-link connection-update-link--info"
									onClick={onShowUpdateInfo}
								>
									How to update
								</button>
							))}
					</div>
				)}
			</div>
			<div className="connection-info-actions">
				{visibleAgents.map((agent) => {
					const { id, title, name } = agent;
					const agentLabel = title || name;

					return (
						<button
							key={id}
							type="button"
							className="connection-icon-btn haptic-trigger"
							onClick={() => openSessions(id)}
							aria-label={`Open ${agentLabel}`}
						>
							<AgentIcon agent={agent} />
						</button>
					);
				})}
				{hiddenAgentCount > 0 && (
					<button
						type="button"
						className="connection-icon-btn connection-agent-more haptic-trigger"
						onClick={() => setAgentsExpanded(true)}
						aria-label={`Show ${hiddenAgentCount} more agents`}
					>
						<span aria-hidden="true">...</span>
					</button>
				)}
			</div>
		</div>
	);
}
