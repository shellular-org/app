import { formatConnectionString } from "lib/e2ee";
import { getSavedHosts } from "lib/machines";
import { loadSettings } from "lib/settings";
import {
	describeStartupTarget,
	pickResumableSession,
	planStartupConnect,
	planStartupOpen,
	startupTargetNeedsAgent,
	startupTargetNeedsProject,
} from "lib/startupPlan";
import toast from "lib/toast";
import { type AcpAgentInfo, acpListSessions } from "state/acp";
import type { Project } from "state/projects";
import { getConnectionSnapshot, subscribeState } from "./connection";

// ─── Types ────────────────────────────────────────────────────

export type StartupPhase = "idle" | "connecting" | "opening" | "done";

export interface StartupSnapshot {
	phase: StartupPhase;
	/** The line the banner shows while the sequence runs. */
	message: string;
}

/**
 * Live views onto the provider's state. They are getters rather than values
 * because the runner starts once and then waits: it has to see what the latest
 * render produced, not what existed at mount.
 */
export interface StartupContext {
	connect: (token: string) => Promise<void>;
	getAgents: () => Record<string, AcpAgentInfo>;
	getProjects: () => Project[];
}

// ─── State ────────────────────────────────────────────────────

const CONNECT_TIMEOUT_MS = 20_000;
const CONTEXT_TIMEOUT_MS = 10_000;
const CONTEXT_POLL_MS = 100;
const TOAST_MS = 3400;

const IDLE: StartupSnapshot = { phase: "idle", message: "" };
const DONE: StartupSnapshot = { phase: "done", message: "" };

const listeners = new Set<() => void>();
let snapshot: StartupSnapshot = IDLE;
/**
 * The module lives exactly as long as the app process, which is the whole
 * implementation of "cold start only": a resume, a `recover()` reconnect or a
 * re-mount all find this already set and stand down.
 */
let hasRun = false;
let cancelled = false;

function emit() {
	for (const listener of Array.from(listeners)) listener();
}

function setSnapshot(next: StartupSnapshot) {
	snapshot = next;
	emit();
}

export function subscribeStartup(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getStartupSnapshot(): StartupSnapshot {
	return snapshot;
}

/**
 * Stops the sequence at the next await boundary. The connection is kept: it is
 * useful either way, and dropping it would punish someone for wanting to do
 * something else with the host that is now up.
 */
export function cancelStartup() {
	if (snapshot.phase !== "connecting" && snapshot.phase !== "opening") return;
	cancelled = true;
	setSnapshot(DONE);
}

// ─── Waiting ──────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForConnection(timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		if (getConnectionSnapshot().connectionStatus === "connected") {
			resolve(true);
			return;
		}

		let settled = false;
		// The status is still "disconnected" for the moment it takes connect() to
		// resolve the server URL, so a bare "disconnected" is not yet a failure.
		// It only becomes one once an attempt has actually started.
		let sawAttempt = false;

		const finish = (connected: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			resolve(connected);
		};

		const timer = setTimeout(() => finish(false), timeoutMs);
		const unsubscribe = subscribeState(() => {
			if (cancelled) {
				finish(false);
				return;
			}
			const { connectionStatus } = getConnectionSnapshot();
			if (connectionStatus === "connected") {
				finish(true);
			} else if (
				connectionStatus === "connecting" ||
				connectionStatus === "reconnecting"
			) {
				sawAttempt = true;
			} else if (sawAttempt) {
				finish(false);
			}
		});
	});
}

/**
 * Agents and projects live in React state inside the provider, not in an
 * external store, so there is nothing to subscribe to and this polls. Both are
 * filled by the existing post-connect callback, so the wait is short in
 * practice and the timeout only matters when the host genuinely has none.
 */
async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate() && !cancelled && Date.now() < deadline) {
		await delay(CONTEXT_POLL_MS);
	}
}

// ─── The sequence ─────────────────────────────────────────────

function fail(reason: string) {
	toast(reason, TOAST_MS);
	setSnapshot(DONE);
}

export async function runStartup(context: StartupContext): Promise<void> {
	if (hasRun) return;
	hasRun = true;

	const { startup } = await loadSettings();
	const connectPlan = planStartupConnect(startup, await getSavedHosts());

	if (connectPlan.kind === "none") {
		// No reason means auto-connect is simply off, which is the default path
		// and has to stay silent.
		if (connectPlan.reason) fail(connectPlan.reason);
		else setSnapshot(DONE);
		return;
	}

	const { host } = connectPlan;
	const hostLabel = host.alias || host.hostname;
	setSnapshot({ phase: "connecting", message: `Connecting to ${hostLabel}` });

	if (getConnectionSnapshot().connectionStatus !== "connected") {
		try {
			await context.connect(
				formatConnectionString(host.hostId, host.encryptionKey),
			);
		} catch (err) {
			if (cancelled) return;
			fail(`Could not reach ${hostLabel}: ${(err as Error).message}`);
			return;
		}
		if (cancelled) return;
		if (!(await waitForConnection(CONNECT_TIMEOUT_MS))) {
			if (cancelled) return;
			fail(`Could not reach ${hostLabel}`);
			return;
		}
	}
	if (cancelled) return;

	if (startup.target === "home") {
		setSnapshot(DONE);
		return;
	}

	setSnapshot({
		phase: "opening",
		message: `Opening ${describeStartupTarget(startup)}`,
	});

	if (startupTargetNeedsAgent(startup.target)) {
		await waitFor(
			() => Object.keys(context.getAgents()).length > 0,
			CONTEXT_TIMEOUT_MS,
		);
	}
	if (cancelled) return;
	if (startupTargetNeedsProject(startup.target)) {
		await waitFor(() => context.getProjects().length > 0, CONTEXT_TIMEOUT_MS);
	}
	if (cancelled) return;

	const openPlan = planStartupOpen(startup, {
		agents: context.getAgents(),
		projects: context.getProjects(),
	});

	if (openPlan.kind === "none") {
		setSnapshot(DONE);
		return;
	}
	if (openPlan.kind === "unavailable") {
		fail(openPlan.reason);
		return;
	}

	// Imported here rather than at the top: App mounts the runner, and
	// lib/navigate imports pushPage from App, so a static import would close
	// that cycle at module-evaluation time.
	const navigate = await import("lib/navigate");
	if (cancelled) return;

	try {
		switch (openPlan.kind) {
			case "terminal":
				navigate.openTerminalTab();
				break;
			case "system-monitor":
				await navigate.openSystemMonitorPage();
				break;
			case "ports":
				await navigate.openPortsPage();
				break;
			case "git-client":
				await navigate.openGitClientPage(
					openPlan.project.path,
					openPlan.project.name,
				);
				break;
			case "new-chat":
				await navigate.openChatPage({
					agentId: openPlan.agent.id,
					agent: openPlan.agent,
					sessionId: "",
					title: "New Chat",
					workspacePath: openPlan.project.path,
					createOnFirstMessage: true,
				});
				break;
			case "last-chat": {
				const { sessions } = await acpListSessions(
					openPlan.agent.id,
					openPlan.project.path,
					openPlan.agent,
				);
				if (cancelled) return;
				const session = pickResumableSession(sessions);
				if (!session?.id) {
					fail(`No previous chat in ${openPlan.project.name}`);
					return;
				}
				await navigate.openChatPage({
					agentId: openPlan.agent.id,
					agent: openPlan.agent,
					sessionId: session.id,
					title: session.title ?? session.id,
					workspacePath: session.workspacePath || openPlan.project.path,
				});
				break;
			}
		}
	} catch (err) {
		console.error("[Startup] Failed to open the start target", err);
		fail(`Could not open ${describeStartupTarget(startup)}`);
		return;
	}

	setSnapshot(DONE);
}
