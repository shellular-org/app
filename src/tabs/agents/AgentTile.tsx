import { pushPage, toToTab } from "App";
import AgentIcon from "components/AgentIcon";
import AppMenu from "components/AppMenu";
import { getInstallationOptions } from "lib/agents";
import ChatSessionsPage from "pages/sessions";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AcpAgentInfo } from "state/acp";
import { getHostInfo } from "state/connection";
import {
	getAgentStreaming,
	listenToSessionStreamingEvent,
} from "state/sessions";
import { createTerminal, getXterm, sendTerminalInput } from "state/terminals";

interface AgentTileProps {
	agent: AcpAgentInfo;
}

export default function AgentTile({ agent }: AgentTileProps) {
	const [isStreaming, setIsStreaming] = useState(() =>
		getAgentStreaming(agent.id),
	);
	const [installing, setInstalling] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const installingRef = useRef(false);

	useEffect(
		() =>
			listenToSessionStreamingEvent((agentId) => {
				if (agentId === agent.id) {
					setIsStreaming(getAgentStreaming(agentId));
				}
			}),
		[agent],
	);

	const handleInstallCommand = useCallback(async (command: string) => {
		if (installingRef.current) return;
		installingRef.current = true;
		setInstalling(true);

		try {
			const terminalId = await createTerminal();
			if (!terminalId) return;
			toToTab("terminals");
			await waitForXterm(terminalId, 5000);
			await new Promise((r) => setTimeout(r, 500));
			sendTerminalInput(terminalId, `${command}\r`);
		} finally {
			setInstalling(false);
			installingRef.current = false;
		}
	}, []);

	const isUnavailable = !agent.available;

	if (isUnavailable) {
		const platform = getHostInfo()?.platform;
		const menuItems = getInstallationOptions(
			agent,
			platform,
			handleInstallCommand,
		);

		return (
			<li
				className={`agent-tile--unavailable${menuOpen ? " agent-tile--highlighted" : ""}`}
			>
				<div className="agent-tile">
					<div className="agent-tile-icon-wrap">
						<AgentIcon agent={agent} className="agent-tile-icon" />
					</div>
					<div className="agent-tile-text">
						<span className="agent-tile-label">
							{agent.title || agent.name}
						</span>
						<span className="agent-tile-desc">
							{getAgentDescription(agent)}
						</span>
					</div>
					{isStreaming && <span className="badge" />}
					{menuItems.length > 0 ? (
						<AppMenu
							items={menuItems}
							ariaLabel={`Install ${agent.title || agent.name}`}
							buttonClassName={`agent-tile-install-btn${installing ? " installing" : ""}`}
							disabled={installing}
							onToggle={setMenuOpen}
						>
							<span
								className={installing ? "icon-loader" : "icon-download"}
								aria-hidden="true"
							/>
						</AppMenu>
					) : (
						<button
							type="button"
							className="agent-tile-install-btn"
							disabled
							aria-label="No install options"
						>
							<span className="icon-download" aria-hidden="true" />
						</button>
					)}
				</div>
			</li>
		);
	}

	return (
		<li>
			<button
				type="button"
				className="agent-tile haptic-trigger"
				onClick={() =>
					agent.id &&
					pushPage(
						`agent-${agent.id}`,
						<ChatSessionsPage backend={agent.id} agent={agent} />,
					)
				}
			>
				<div className="agent-tile-icon-wrap">
					<AgentIcon agent={agent} className="agent-tile-icon" />
				</div>
				<div className="agent-tile-text">
					<span className="agent-tile-label">{agent.title || agent.name}</span>
					<span className="agent-tile-desc">{getAgentDescription(agent)}</span>
				</div>
				{isStreaming && <span className="badge" />}
				<span
					className="icon-chevron-right agent-tile-chevron"
					aria-hidden="true"
				/>
			</button>
		</li>
	);
}

async function waitForXterm(
	terminalId: string,
	timeoutMs: number,
): Promise<import("@xterm/xterm").Terminal | null> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const xterm = getXterm(terminalId);
		if (xterm) return xterm;
		await new Promise((r) => setTimeout(r, 100));
	}
	return null;
}

function getAgentDescription(agent: AcpAgentInfo): string {
	if (agent.error) return agent.error;
	if (agent.description) return agent.description;
	return agent.available ? "Ready to chat" : "Not installed";
}
