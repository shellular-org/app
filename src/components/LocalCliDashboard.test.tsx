import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LocalCliSnapshot } from "bridge/localCli";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DashboardSnapshot = {
	capability: {
		available: boolean;
		sandboxed: boolean;
		protocolVersion: number;
	};
	cli: LocalCliSnapshot | null;
	busy: boolean;
	error: string | null;
	phase: "idle" | "preparing" | "connecting" | "ready" | "error";
};

const mocks = vi.hoisted(() => ({
	copyToClipboard: vi.fn(),
	initializeLocalCli: vi.fn(),
	snapshot: {
		capability: { available: true, sandboxed: false, protocolVersion: 1 },
		cli: null,
		busy: false,
		error: "LocalCLI/ticket: invalid client.user",
		phase: "error" as const,
	} as DashboardSnapshot,
}));

vi.mock("bridge/localCli", () => ({
	default: { qrCode: vi.fn() },
}));
vi.mock("lib/clipboard", () => ({
	copyToClipboard: mocks.copyToClipboard,
}));
vi.mock("state/localCli", () => ({
	getLocalCliSnapshot: () => mocks.snapshot,
	initializeLocalCli: mocks.initializeLocalCli,
	setLocalClientApproval: vi.fn(),
	subscribeLocalCli: () => () => undefined,
}));

import LocalCliDashboard from "./LocalCliDashboard";

beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(mocks.snapshot, {
		cli: null,
		busy: false,
		error: "LocalCLI/ticket: invalid client.user",
		phase: "error",
	});
});
afterEach(cleanup);

describe("LocalCliDashboard errors", () => {
	it("copies the visible error and keeps a single retry action", () => {
		render(<LocalCliDashboard />);

		fireEvent.click(screen.getByRole("button", { name: "Copy error" }));
		expect(mocks.copyToClipboard).toHaveBeenCalledWith({
			text: mocks.snapshot.error,
			successMessage: "Error copied",
		});

		const retry = screen.getByRole("button", { name: "Retry" });
		fireEvent.click(retry);
		expect(mocks.initializeLocalCli).toHaveBeenCalledOnce();
	});

	it("uses semantic card subtext for disclosure and client metadata", () => {
		Object.assign(mocks.snapshot, {
			cli: {
				state: "ready",
				cliVersion: "1.2.3",
				clients: [
					{
						clientId: "client-123",
						platform: "ios",
						appVersion: "1.0.0",
						deviceModel: "iPhone",
						approved: true,
						connected: true,
						firstSeen: "2026-07-27T00:00:00Z",
						lastSeen: "2026-07-27T00:00:00Z",
					},
				],
				logs: [],
			},
			error: null,
			phase: "ready",
		});

		render(<LocalCliDashboard />);

		expect(screen.getByText("1 connected · 1 allowed")).toHaveClass(
			"card-subtext",
		);
		fireEvent.click(screen.getByRole("button", { name: /Clients/ }));
		expect(screen.getByText(/client-123/)).toHaveClass("card-subtext");
	});
});
