import type { AiSession } from "@shellular/protocol";
import type { SavedHost } from "lib/machines";
import type {
	StartupConnectMode,
	StartupSettings,
	StartupTarget,
} from "lib/settings";
import type { AcpAgentInfo } from "state/acp";
import type { Project } from "state/projects";

// ─── Types ────────────────────────────────────────────────────

/** What the runner should do about the connection before anything opens. */
export type StartupConnectPlan =
	| { kind: "none"; reason?: string }
	| { kind: "connect"; host: SavedHost };

/**
 * What the runner should open once the host is up. `unavailable` carries the
 * sentence the toast shows; there is deliberately no fallback member, because
 * silently opening something else is worse than doing nothing.
 */
export type StartupOpenPlan =
	| { kind: "none" }
	| { kind: "unavailable"; reason: string }
	| { kind: "terminal" }
	| { kind: "system-monitor" }
	| { kind: "ports" }
	| { kind: "git-client"; project: Project }
	| { kind: "new-chat"; agent: AcpAgentInfo; project: Project }
	| { kind: "last-chat"; agent: AcpAgentInfo; project: Project };

export interface StartupOpenContext {
	agents: Record<string, AcpAgentInfo>;
	projects: Project[];
}

// ─── Options and labels ───────────────────────────────────────

export const STARTUP_CONNECT_OPTIONS: {
	value: StartupConnectMode;
	label: string;
}[] = [
	{ value: "off", label: "Off" },
	{ value: "last-host", label: "Last used host" },
	{ value: "pinned-host", label: "Specific host" },
];

export const STARTUP_TARGET_OPTIONS: {
	value: StartupTarget;
	label: string;
}[] = [
	{ value: "home", label: "Home" },
	{ value: "new-chat", label: "New chat" },
	{ value: "last-chat", label: "Continue last chat" },
	{ value: "terminal", label: "Terminal" },
	{ value: "git-client", label: "Git client" },
	{ value: "system-monitor", label: "System monitor" },
	{ value: "ports", label: "Ports" },
];

export function startupTargetNeedsAgent(target: StartupTarget): boolean {
	return target === "new-chat" || target === "last-chat";
}

export function startupTargetNeedsProject(target: StartupTarget): boolean {
	return (
		target === "new-chat" || target === "last-chat" || target === "git-client"
	);
}

/** One line for the banner, built from the settings alone. */
export function describeStartupTarget(settings: StartupSettings): string {
	const label =
		STARTUP_TARGET_OPTIONS.find((option) => option.value === settings.target)
			?.label ?? settings.target;
	if (!startupTargetNeedsProject(settings.target)) return label;
	const folder = basename(settings.projectPath);
	return folder ? `${label} · ${folder}` : label;
}

// ─── Planning ─────────────────────────────────────────────────

export function planStartupConnect(
	settings: StartupSettings,
	hosts: SavedHost[],
): StartupConnectPlan {
	if (settings.connect === "off") return { kind: "none" };

	if (settings.connect === "last-host") {
		// getSavedHosts() sorts by lastConnected descending, so the first entry is
		// the most recent one.
		const host = hosts[0];
		return host
			? { kind: "connect", host }
			: { kind: "none", reason: "No saved host to connect to" };
	}

	const host = hosts.find((entry) => entry.hostId === settings.hostId);
	return host
		? { kind: "connect", host }
		: {
				kind: "none",
				reason: "The host set for startup is no longer saved",
			};
}

export function planStartupOpen(
	settings: StartupSettings,
	context: StartupOpenContext,
): StartupOpenPlan {
	// Every target except Home needs a live connection, and a cold start is only
	// connected when auto-connect brought the host up. With auto-connect off
	// there is nothing for a target to act on, so the rule stands down entirely.
	if (settings.connect === "off") return { kind: "none" };

	const { target } = settings;
	if (target === "home") return { kind: "none" };
	if (target === "terminal") return { kind: "terminal" };
	if (target === "system-monitor") return { kind: "system-monitor" };
	if (target === "ports") return { kind: "ports" };

	if (target === "git-client") {
		const project = findProject(settings, context);
		return project ? { kind: "git-client", project } : missingProject(settings);
	}

	const agent = context.agents[settings.agentId];
	if (!agent) {
		return {
			kind: "unavailable",
			reason: settings.agentId
				? `${settings.agentId} is not installed on this host`
				: "No agent is set for startup",
		};
	}
	if (!agent.available) {
		return {
			kind: "unavailable",
			reason: `${agent.title || agent.name} is not available on this host`,
		};
	}

	const project = findProject(settings, context);
	if (!project) return missingProject(settings);

	return { kind: target, agent, project };
}

/**
 * The newest session of the list, by our own reckoning. The sessions page
 * renders whatever order the host sends and only groups by date, so nothing in
 * the app guarantees an ordering. For a list a wrong order is cosmetic; for
 * "open the newest chat automatically" it would open the wrong conversation.
 */
export function pickResumableSession(sessions: AiSession[]): AiSession | null {
	const usable = sessions.filter((session) => Boolean(session.id));
	if (!usable.length) return null;
	return [...usable].sort(
		(left, right) => sessionTime(right) - sessionTime(left),
	)[0];
}

// ─── Helpers ──────────────────────────────────────────────────

function findProject(
	settings: StartupSettings,
	context: StartupOpenContext,
): Project | undefined {
	return context.projects.find(
		(project) => project.path === settings.projectPath,
	);
}

function missingProject(settings: StartupSettings): StartupOpenPlan {
	return {
		kind: "unavailable",
		reason: settings.projectPath
			? `${settings.projectPath} is not a project on this host`
			: "No project is set for startup",
	};
}

function sessionTime(session: AiSession): number {
	return session.updatedAt ?? session.createdAt ?? 0;
}

function basename(path: string): string {
	return path.split("/").filter(Boolean).slice(-1)[0] ?? "";
}
