import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("bridge/dialog", () => ({ default: {} }));
vi.mock("browser", () => ({ cachePorts: vi.fn() }));
vi.mock("components/EmptyState", () => ({ default: () => null }));
vi.mock("components/Loader", () => ({ default: () => null }));
vi.mock("components/Page", () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("state", () => ({
	useShellular: () => ({ connectionStatus: "connected" }),
}));
vi.mock("state/ports", () => ({
	fetchPorts: async () => [
		{ port: 4321, pid: 1234, process: "node", address: "127.0.0.1" },
	],
	killPort: vi.fn(),
}));
vi.mock("workbench/browserSurface", () => ({
	openBrowserSurface: vi.fn(),
}));

import PortsPage from ".";

afterEach(cleanup);

describe("PortsPage", () => {
	it("uses semantic card subtext for process counts and PIDs", async () => {
		render(<PortsPage />);

		await waitFor(() => expect(screen.getByText("1 port")).toBeVisible());
		expect(screen.getByText("1 port")).toHaveClass("card-subtext");
		expect(screen.getByText("PID 1234")).toHaveClass("card-subtext");
	});
});
