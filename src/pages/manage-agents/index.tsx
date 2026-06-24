import "./style.scss";
import { closePage, toToTab } from "App";
import { MsgType } from "@shellular/protocol";
import dialog from "bridge/dialog";
import AgentIcon from "components/AgentIcon";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Page from "components/Page";
import { getInstallationOptions } from "lib/agents";
import toast from "lib/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShellular } from "state";
import {
	acpAddCustomAgent,
	acpManageListAgents,
	acpRemoveCustomAgent,
	acpSetAgentEnabled,
	acpUpdateCustomAgent,
	type CustomAcpAgentInput,
	type ManagedAcpAgentInfo,
} from "state/acp";
import { getHostInfo, sendMessage } from "state/connection";
import { createTerminal, getXterm } from "state/terminals";

type BusyAction = "install" | "toggle" | "remove";

export default function ManageAgentsPage() {
	const { loadAgents } = useShellular();
	const [agents, setAgents] = useState<ManagedAcpAgentInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [showCustomForm, setShowCustomForm] = useState(false);
	const [editingCustomAgent, setEditingCustomAgent] =
		useState<ManagedAcpAgentInfo | null>(null);
	const [busy, setBusy] = useState<Record<string, BusyAction | undefined>>({});
	const commandRunningRef = useRef(false);

	const loadManagedAgents = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setAgents(await acpManageListAgents());
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadManagedAgents();
	}, [loadManagedAgents]);

	const runTerminalCommand = useCallback(
		async (command: string, agentName: string) => {
			if (commandRunningRef.current) return;

			const hostInfo = getHostInfo();
			let message = "Run this command?";
			if (agentName && hostInfo?.hostname) {
				const platformName = getPlatformDisplayName(hostInfo.platform);
				message = `Install ${agentName} on host ${hostInfo.hostname} (${platformName})?`;
			}

			const ok = await dialog.confirm(message, "Confirm");
			if (!ok) return;

			commandRunningRef.current = true;
			try {
				const terminalId = await createTerminal();
				if (!terminalId) return;
				closePage("manage-agents");
				toToTab("terminals");
				await waitForXterm(terminalId, 5000);
				await new Promise((resolve) => setTimeout(resolve, 300));
				sendMessage({
					type: MsgType.TERMINAL_DATA,
					data: { terminalId, data: `${command}\r` },
				});
				toast("Command started. Refresh agents after it finishes.", 3500);
			} finally {
				commandRunningRef.current = false;
			}
		},
		[],
	);

	const refreshAll = useCallback(async () => {
		await loadManagedAgents();
		await loadAgents();
	}, [loadAgents, loadManagedAgents]);

	const updateAgent = useCallback(
		async (agent: ManagedAcpAgentInfo, patch: Partial<ManagedAcpAgentInfo>) => {
			setAgents((current) =>
				current.map((item) =>
					item.id === agent.id ? { ...item, ...patch } : item,
				),
			);
			await loadAgents();
		},
		[loadAgents],
	);

	const toggleAgent = useCallback(
		async (agent: ManagedAcpAgentInfo) => {
			setBusy((value) => ({ ...value, [agent.id]: "toggle" }));
			try {
				const updated = await acpSetAgentEnabled(agent.id, !agent.enabled);
				await updateAgent(agent, updated);
			} catch (err) {
				dialog.message((err as Error).message, "Agent Update Failed");
			} finally {
				setBusy((value) => ({ ...value, [agent.id]: undefined }));
			}
		},
		[updateAgent],
	);

	const removeCustom = useCallback(
		async (agent: ManagedAcpAgentInfo) => {
			const ok = await dialog.confirm(
				`Remove custom agent "${agent.title || agent.name}"?`,
				"Remove Agent",
			);
			if (!ok) return;
			setBusy((value) => ({ ...value, [agent.id]: "remove" }));
			try {
				await acpRemoveCustomAgent(agent.id);
				await refreshAll();
			} catch (err) {
				dialog.message((err as Error).message, "Remove Failed");
			} finally {
				setBusy((value) => ({ ...value, [agent.id]: undefined }));
			}
		},
		[refreshAll],
	);

	const visibleAgents = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return agents;
		return agents.filter((agent) =>
			[agent.id, agent.name, agent.title, agent.description]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(needle)),
		);
	}, [agents, query]);

	const builtin = visibleAgents.filter((agent) => agent.source !== "custom");
	const custom = visibleAgents.filter((agent) => agent.source === "custom");

	return (
		<Page
			title="Manage Agents"
			rightSlot={
				<button
					type="button"
					className="manage-agents-header-btn haptic-trigger"
					onClick={refreshAll}
					aria-label="Refresh agents"
				>
					<span className="icon-refresh-cw" aria-hidden="true" />
				</button>
			}
			className="manage-agents-page"
		>
			<div className="manage-agents-toolbar">
				<label className="manage-agents-search">
					<span className="icon-search" aria-hidden="true" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search agents"
						autoCapitalize="none"
						autoCorrect="off"
					/>
				</label>
				<button
					type="button"
					className="manage-agents-add haptic-trigger"
					onClick={() => {
						setEditingCustomAgent(null);
						setShowCustomForm((value) => !value);
					}}
				>
					<span className="icon-plus" aria-hidden="true" />
					<span>Custom</span>
				</button>
			</div>

			{showCustomForm && (
				<CustomAgentForm
					key={editingCustomAgent?.id ?? "new"}
					agent={editingCustomAgent}
					onCancel={() => {
						setEditingCustomAgent(null);
						setShowCustomForm(false);
					}}
					onSave={async (input) => {
						try {
							if (editingCustomAgent) {
								await acpUpdateCustomAgent(input);
							} else {
								await acpAddCustomAgent(input);
							}
							setEditingCustomAgent(null);
							setShowCustomForm(false);
							await refreshAll();
							toast(
								editingCustomAgent
									? "Custom agent updated"
									: "Custom agent added",
							);
						} catch (err) {
							dialog.message((err as Error).message, "Save Agent Failed");
						}
					}}
				/>
			)}

			{loading && <EmptyState message="Loading agents..." mascot="loading" />}
			{error && !loading && (
				<EmptyState
					message={`Failed to load agents: ${error}`}
					mascot="error"
				/>
			)}
			{!loading && !error && visibleAgents.length === 0 && (
				<EmptyState message="No agents match your search" mascot="thinking" />
			)}

			{!loading && !error && visibleAgents.length > 0 && (
				<div className="manage-agents-groups">
					<AgentGroup
						title="Built-in"
						agents={builtin}
						busy={busy}
						onRunCommand={runTerminalCommand}
						onToggle={toggleAgent}
						onEditCustom={(agent) => {
							setEditingCustomAgent(agent);
							setShowCustomForm(true);
						}}
						onRemoveCustom={removeCustom}
					/>
					<AgentGroup
						title="Custom"
						agents={custom}
						busy={busy}
						onRunCommand={runTerminalCommand}
						onToggle={toggleAgent}
						onEditCustom={(agent) => {
							setEditingCustomAgent(agent);
							setShowCustomForm(true);
						}}
						onRemoveCustom={removeCustom}
					/>
				</div>
			)}
		</Page>
	);
}

function AgentGroup({
	title,
	agents,
	busy,
	onRunCommand,
	onToggle,
	onEditCustom,
	onRemoveCustom,
}: {
	title: string;
	agents: ManagedAcpAgentInfo[];
	busy: Record<string, BusyAction | undefined>;
	onRunCommand: (command: string, agentName: string) => Promise<void>;
	onToggle: (agent: ManagedAcpAgentInfo) => Promise<void>;
	onEditCustom: (agent: ManagedAcpAgentInfo) => void;
	onRemoveCustom: (agent: ManagedAcpAgentInfo) => Promise<void>;
}) {
	if (!agents.length) return null;
	return (
		<section className="manage-agents-group">
			<h2>{title}</h2>
			<ul>
				{agents.map((agent) => (
					<AgentManageRow
						key={agent.id}
						agent={agent}
						busy={busy[agent.id]}
						onRunCommand={onRunCommand}
						onToggle={onToggle}
						onEditCustom={onEditCustom}
						onRemoveCustom={onRemoveCustom}
					/>
				))}
			</ul>
		</section>
	);
}

function AgentManageRow({
	agent,
	busy,
	onRunCommand,
	onToggle,
	onEditCustom,
	onRemoveCustom,
}: {
	agent: ManagedAcpAgentInfo;
	busy?: BusyAction;
	onRunCommand: (command: string, agentName: string) => Promise<void>;
	onToggle: (agent: ManagedAcpAgentInfo) => Promise<void>;
	onEditCustom: (agent: ManagedAcpAgentInfo) => void;
	onRemoveCustom: (agent: ManagedAcpAgentInfo) => Promise<void>;
}) {
	const installOptions = getInstallationOptions(
		agent,
		getHostInfo()?.platform,
		(command) => {
			onRunCommand(command, agent.title || agent.name);
		},
	);
	const primaryCommand = primaryActionCommand(agent, installOptions);
	const disabled = Boolean(busy);

	return (
		<li className="manage-agent-row" data-enabled={agent.enabled}>
			<div className="manage-agent-icon">
				<AgentIcon agent={agent} />
			</div>
			<div className="manage-agent-main">
				<div className="manage-agent-title-row">
					<span className="manage-agent-title">
						{agent.title || agent.name}
					</span>
					<span className="manage-agent-source">{agent.source}</span>
				</div>
				<span className="manage-agent-meta">{agentMeta(agent)}</span>
				{agent.error && (
					<span className="manage-agent-error">{agent.error}</span>
				)}
			</div>
			<div className="manage-agent-actions">
				{busy && <Loader size={16} />}
				{primaryCommand && !busy && (
					<button
						type="button"
						className="manage-agent-primary haptic-trigger"
						onClick={() =>
							onRunCommand(primaryCommand.command, agent.title || agent.name)
						}
					>
						{primaryCommand.label}
					</button>
				)}
				{agent.installed && (
					<label className="manage-agent-switch">
						<input
							type="checkbox"
							checked={agent.enabled}
							disabled={disabled}
							onChange={() => onToggle(agent)}
							aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.title || agent.name}`}
						/>
						<span aria-hidden="true" />
					</label>
				)}
				{agent.source === "custom" && !busy && (
					<>
						<button
							type="button"
							className="manage-agent-edit haptic-trigger"
							onClick={() => onEditCustom(agent)}
							aria-label={`Edit ${agent.title || agent.name}`}
						>
							<span className="icon-edit-3" aria-hidden="true" />
						</button>
						<button
							type="button"
							className="manage-agent-remove haptic-trigger"
							onClick={() => onRemoveCustom(agent)}
							aria-label={`Remove ${agent.title || agent.name}`}
						>
							<span className="icon-trash-2" aria-hidden="true" />
						</button>
					</>
				)}
			</div>
		</li>
	);
}

function CustomAgentForm({
	agent,
	onCancel,
	onSave,
}: {
	agent?: ManagedAcpAgentInfo | null;
	onCancel: () => void;
	onSave: (input: CustomAcpAgentInput) => Promise<void>;
}) {
	const custom = agent?.custom;
	const isEditing = Boolean(agent);
	const [id, setId] = useState(custom?.id ?? agent?.id ?? "");
	const [name, setName] = useState(custom?.name ?? agent?.name ?? "");
	const [icon, setIcon] = useState(custom?.icon ?? agent?.icon ?? "");
	const [command, setCommand] = useState(custom?.command ?? "");
	const [args, setArgs] = useState((custom?.args ?? []).join("\n"));
	const [env, setEnv] = useState(formatEnv(custom?.env));
	const [cwd, setCwd] = useState(custom?.cwd ?? "");
	const [saving, setSaving] = useState(false);

	const save = async () => {
		setSaving(true);
		try {
			await onSave({
				id,
				name,
				icon: icon.trim() || undefined,
				command,
				args: parseLines(args),
				env: parseEnv(env),
				cwd: cwd.trim() || undefined,
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<form
			className="manage-agents-custom-form"
			onSubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			<div className="manage-custom-form-head">
				<div>
					<h2>
						{isEditing ? "Edit Custom ACP Agent" : "Add Custom ACP Agent"}
					</h2>
					<p>
						Register a command that already speaks{" "}
						<a
							href="https://agentclientprotocol.com/"
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							ACP
						</a>{" "}
						over stdio.
					</p>
				</div>
				<button
					type="button"
					className="manage-custom-close haptic-trigger"
					onClick={onCancel}
					aria-label="Close custom agent form"
				>
					<span className="icon-x" aria-hidden="true" />
				</button>
			</div>
			<div className="manage-form-grid">
				<label className="manage-form-field">
					<span>ID</span>
					<input
						value={id}
						onChange={(event) => setId(event.target.value)}
						placeholder="my-agent"
						disabled={isEditing}
						autoCapitalize="none"
						autoCorrect="off"
					/>
					<small>
						{isEditing
							? "ID is fixed because sessions and settings use it."
							: "Lowercase slug used internally."}
					</small>
				</label>
				<label className="manage-form-field">
					<span>Name</span>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="My Agent"
					/>
				</label>
				<label className="manage-form-field manage-form-field--wide">
					<span>Logo URL</span>
					<input
						value={icon}
						onChange={(event) => setIcon(event.target.value)}
						placeholder="https://example.com/agent-logo.png"
						autoCapitalize="none"
						autoCorrect="off"
					/>
					<small>
						Optional image URL or data URL for custom agent surfaces.
					</small>
				</label>
				<label className="manage-form-field manage-form-field--wide">
					<span>Command</span>
					<input
						value={command}
						onChange={(event) => setCommand(event.target.value)}
						placeholder="my-agent-acp"
						autoCapitalize="none"
						autoCorrect="off"
					/>
				</label>
				<label className="manage-form-field manage-form-field--wide">
					<span>Working directory</span>
					<input
						value={cwd}
						onChange={(event) => setCwd(event.target.value)}
						placeholder="optional"
						autoCapitalize="none"
						autoCorrect="off"
					/>
				</label>
				<label className="manage-form-field">
					<span>Args</span>
					<textarea
						value={args}
						onChange={(event) => setArgs(event.target.value)}
						placeholder={"acp\n--stdio"}
					/>
					<small>One argument per line.</small>
				</label>
				<label className="manage-form-field">
					<span>Env</span>
					<textarea
						value={env}
						onChange={(event) => setEnv(event.target.value)}
						placeholder={"KEY=value\nOTHER=value"}
					/>
					<small>Optional environment variables.</small>
				</label>
			</div>
			<div className="manage-form-actions">
				<button type="button" onClick={onCancel} disabled={saving}>
					Cancel
				</button>
				<button type="submit" disabled={saving}>
					{saving ? "Saving..." : isEditing ? "Save Changes" : "Save Agent"}
				</button>
			</div>
		</form>
	);
}

function primaryActionCommand(
	agent: ManagedAcpAgentInfo,
	installOptions: ReturnType<typeof getInstallationOptions>,
) {
	if (!agent.installed && installOptions[0]?.subText) {
		return { label: "Install", command: installOptions[0].subText };
	}
	return null;
}

function agentMeta(agent: ManagedAcpAgentInfo) {
	const parts = [
		agent.enabled ? "Enabled" : "Disabled",
		agent.installed ? "Installed" : "Not installed",
		agent.version ? `v${agent.version}` : "",
	].filter(Boolean);
	return parts.join(" · ");
}

function parseLines(value: string) {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function parseEnv(value: string) {
	const entries = parseLines(value).flatMap((line) => {
		const index = line.indexOf("=");
		if (index <= 0) return [];
		return [[line.slice(0, index).trim(), line.slice(index + 1)] as const];
	});
	return entries.length ? Object.fromEntries(entries) : undefined;
}

function formatEnv(env: Record<string, string> | undefined) {
	if (!env) return "";
	return Object.entries(env)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
}

function getPlatformDisplayName(platform?: string): string {
	switch (platform) {
		case "darwin":
			return "Mac";
		case "linux":
			return "Linux";
		case "win32":
			return "Windows";
		default:
			return platform || "Unknown";
	}
}

async function waitForXterm(
	terminalId: string,
	timeoutMs: number,
): Promise<import("@xterm/xterm").Terminal | null> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const xterm = getXterm(terminalId);
		if (xterm) return xterm;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return null;
}
