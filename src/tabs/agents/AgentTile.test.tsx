import { cleanup, render, screen } from "@testing-library/react";
import type { AcpAgentInfo } from "state/acp";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("App", () => ({ pushPage: vi.fn(), toToTab: vi.fn() }));
vi.mock("components/AgentIcon", () => ({
	default: () => <span aria-hidden="true" />,
}));
vi.mock("lib/agents", () => ({
	getAgentIcon: () => "icon-agent",
	getInstallationOptions: () => [],
}));
vi.mock("state/connection", () => ({ getHostInfo: () => null }));
vi.mock("state/sessions", () => ({
	getAgentStreaming: () => false,
	listenToSessionStreamingEvent: () => () => undefined,
}));
vi.mock("state/terminals", () => ({
	createTerminal: vi.fn(),
	getXterm: () => null,
	sendTerminalInput: vi.fn(),
}));
vi.mock("workbench/navigation", () => ({ openInWorkbench: () => false }));
vi.mock("workbench/secondarySidebar", () => ({
	showSessionsSidebar: vi.fn(),
}));

import AgentTile from "./AgentTile";

afterEach(cleanup);

describe("AgentTile", () => {
	it("uses semantic card subtext for the agent description", () => {
		const agent: AcpAgentInfo = {
			id: "codex",
			name: "codex",
			title: "Codex",
			description: "Build software with an agent",
			available: true,
			state: "ready",
		};

		render(<AgentTile agent={agent} onSelect={vi.fn()} />);

		expect(screen.getByText(agent.description ?? "")).toHaveClass(
			"agent-tile-desc",
			"card-subtext",
		);
	});
});
