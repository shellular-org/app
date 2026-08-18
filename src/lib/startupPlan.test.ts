import type { AiSession } from "@shellular/protocol";
import type { SavedHost } from "lib/machines";
import type { StartupSettings } from "lib/settings";
import type { AcpAgentInfo } from "state/acp";
import type { Project } from "state/projects";
import { describe, expect, it } from "vitest";
import {
	describeStartupTarget,
	pickResumableSession,
	planStartupConnect,
	planStartupOpen,
} from "./startupPlan";

function host(hostId: string, lastConnected: number): SavedHost {
	return {
		hostId,
		encryptionKey: "key",
		hostname: hostId,
		platform: "linux",
		lastConnected,
	};
}

function agent(id: string, available: boolean): AcpAgentInfo {
	return {
		id,
		name: id,
		title: id === "claude" ? "Claude Code" : id,
		available,
		state: available ? "ready" : "unavailable",
	};
}

function project(path: string): Project {
	return {
		path,
		name: path.split("/").filter(Boolean).slice(-1)[0] ?? path,
		addedAt: 0,
	};
}

function settings(overrides: Partial<StartupSettings> = {}): StartupSettings {
	return {
		connect: "last-host",
		hostId: "",
		target: "home",
		agentId: "",
		projectPath: "",
		...overrides,
	};
}

function session(
	id: string | undefined,
	times: { createdAt: number; updatedAt?: number },
): AiSession {
	return {
		id,
		createdAt: times.createdAt,
		updatedAt: times.updatedAt ?? times.createdAt,
	} as AiSession;
}

describe("startup connect plan", () => {
	it("does nothing when auto-connect is off", () => {
		expect(
			planStartupConnect(settings({ connect: "off" }), [host("a", 2)]),
		).toEqual({ kind: "none" });
	});

	it("takes the most recently connected host for the last-host mode", () => {
		const hosts = [host("recent", 20), host("older", 10)];
		expect(
			planStartupConnect(settings({ connect: "last-host" }), hosts),
		).toEqual({ kind: "connect", host: hosts[0] });
	});

	it("explains itself when the last-host mode has no host to use", () => {
		expect(planStartupConnect(settings({ connect: "last-host" }), [])).toEqual({
			kind: "none",
			reason: "No saved host to connect to",
		});
	});

	it("resolves a pinned host by id", () => {
		const hosts = [host("a", 20), host("b", 10)];
		expect(
			planStartupConnect(
				settings({ connect: "pinned-host", hostId: "b" }),
				hosts,
			),
		).toEqual({ kind: "connect", host: hosts[1] });
	});

	it("explains itself when the pinned host is no longer saved", () => {
		expect(
			planStartupConnect(settings({ connect: "pinned-host", hostId: "gone" }), [
				host("a", 20),
			]),
		).toEqual({
			kind: "none",
			reason: "The host set for startup is no longer saved",
		});
	});
});

describe("startup open plan", () => {
	const context = {
		agents: { claude: agent("claude", true), broken: agent("broken", false) },
		projects: [project("/home/jk/owly-agent")],
	};

	it("opens nothing while auto-connect is off, whatever the target says", () => {
		expect(
			planStartupOpen(
				settings({
					connect: "off",
					target: "new-chat",
					agentId: "claude",
					projectPath: "/home/jk/owly-agent",
				}),
				context,
			),
		).toEqual({ kind: "none" });
	});

	it("opens nothing for the home target", () => {
		expect(planStartupOpen(settings({ target: "home" }), context)).toEqual({
			kind: "none",
		});
	});

	it("passes the parameterless targets straight through", () => {
		expect(planStartupOpen(settings({ target: "terminal" }), context)).toEqual({
			kind: "terminal",
		});
		expect(planStartupOpen(settings({ target: "ports" }), context)).toEqual({
			kind: "ports",
		});
		expect(
			planStartupOpen(settings({ target: "system-monitor" }), context),
		).toEqual({ kind: "system-monitor" });
	});

	it("resolves a chat target to its agent and project", () => {
		expect(
			planStartupOpen(
				settings({
					target: "new-chat",
					agentId: "claude",
					projectPath: "/home/jk/owly-agent",
				}),
				context,
			),
		).toEqual({
			kind: "new-chat",
			agent: context.agents.claude,
			project: context.projects[0],
		});
	});

	it("reports an agent that is not installed on this host", () => {
		expect(
			planStartupOpen(
				settings({
					target: "last-chat",
					agentId: "codex",
					projectPath: "/home/jk/owly-agent",
				}),
				context,
			),
		).toEqual({
			kind: "unavailable",
			reason: "codex is not installed on this host",
		});
	});

	it("reports an agent that is installed but unavailable", () => {
		expect(
			planStartupOpen(
				settings({
					target: "new-chat",
					agentId: "broken",
					projectPath: "/home/jk/owly-agent",
				}),
				context,
			),
		).toEqual({
			kind: "unavailable",
			reason: "broken is not available on this host",
		});
	});

	it("reports a project that is no longer on the host", () => {
		expect(
			planStartupOpen(
				settings({ target: "git-client", projectPath: "/home/jk/gone" }),
				context,
			),
		).toEqual({
			kind: "unavailable",
			reason: "/home/jk/gone is not a project on this host",
		});
	});

	it("reports a target that was never finished being configured", () => {
		expect(
			planStartupOpen(settings({ target: "git-client" }), context),
		).toEqual({ kind: "unavailable", reason: "No project is set for startup" });
	});
});

describe("resumable session", () => {
	it("returns null for an empty list", () => {
		expect(pickResumableSession([])).toBeNull();
	});

	it("takes the newest session regardless of the order the host sent", () => {
		const newest = session("new", { createdAt: 1, updatedAt: 30 });
		expect(
			pickResumableSession([
				session("old", { createdAt: 1, updatedAt: 10 }),
				newest,
				session("mid", { createdAt: 1, updatedAt: 20 }),
			]),
		).toEqual(newest);
	});

	it("skips sessions without an id", () => {
		const usable = session("usable", { createdAt: 1, updatedAt: 5 });
		expect(
			pickResumableSession([
				session(undefined, { createdAt: 1, updatedAt: 99 }),
				usable,
			]),
		).toEqual(usable);
	});

	it("falls back to createdAt when updatedAt is missing", () => {
		const newest = { id: "new", createdAt: 40 } as AiSession;
		expect(
			pickResumableSession([{ id: "old", createdAt: 10 } as AiSession, newest]),
		).toEqual(newest);
	});
});

describe("startup target description", () => {
	it("names the folder for the targets that carry one", () => {
		expect(
			describeStartupTarget(
				settings({ target: "new-chat", projectPath: "/home/jk/owly-agent" }),
			),
		).toEqual("New chat · owly-agent");
	});

	it("names the target alone for the ones that carry nothing", () => {
		expect(describeStartupTarget(settings({ target: "ports" }))).toEqual(
			"Ports",
		);
	});
});
