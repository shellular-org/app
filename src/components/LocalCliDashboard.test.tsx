import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	copyToClipboard: vi.fn(),
	initializeLocalCli: vi.fn(),
	snapshot: {
		capability: { available: true, sandboxed: false, protocolVersion: 1 },
		cli: null,
		busy: false,
		error: "LocalCLI/ticket: invalid client.user",
		phase: "error" as const,
	},
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

beforeEach(() => vi.clearAllMocks());
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
});
