import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("bridge/dialog", () => ({
	default: { confirm: vi.fn(async () => false), message: vi.fn() },
}));
vi.mock("components/Mascot", () => ({
	default: ({ label }: { label: string }) => <span>{label}</span>,
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
	it("keeps connection controls without a System Monitor shortcut", () => {
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
		expect(screen.queryByRole("button", { name: "System Monitor" })).toBeNull();
	});
});
