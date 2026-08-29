import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("bridge/dialog", () => ({
	default: { confirm: vi.fn(async () => false), message: vi.fn() },
}));
vi.mock("components/Mascot", () => ({
	default: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("lib/navigate", () => ({
	openSessionsPage: vi.fn(),
	openSystemMonitorPage: vi.fn(),
}));
vi.mock("state", () => ({
	useShellular: () => ({
		serverUrl: "https://example.test",
		disconnect: vi.fn(),
		batteryInfo: null,
		agents: {},
	}),
}));
vi.mock("state/connection", () => ({
	onMessage: () => () => {},
	sendMessage: vi.fn(),
}));

import ConnectionInfo from "./ConnectionInfo";

afterEach(cleanup);

describe("Home connection card", () => {
	it("keeps connection controls and exposes System Monitor", () => {
		render(
			<ConnectionInfo
				hostInfo={
					{
						hostname: "workstation",
						username: "developer",
						platform: "darwin",
						dir: "/work",
					} as never
				}
			/>,
		);
		expect(screen.getByRole("button", { name: "Disconnect" })).toBeVisible();
		expect(
			screen.getByRole("button", { name: "System Monitor" }),
		).toBeVisible();
	});
});
