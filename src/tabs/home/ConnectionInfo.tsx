import "./ConnectionInfo.scss";
import { pushPage } from "App";
import type { AiBackend, HostInfo } from "@shellular/protocol";
import dialog from "bridge/dialog";
import AgentIcon from "components/AgentIcon";
import Mascot from "components/Mascot";
import appConfig from "lib/appConfig";
import { getPlatformIcon } from "lib/utils";
import { useCallback, useMemo, useState } from "react";
import { useShellular } from "state";

const COLLAPSED_AGENT_COUNT = 5;

export default function ConnectionInfo({ hostInfo }: { hostInfo: HostInfo }) {
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
