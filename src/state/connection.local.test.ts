import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	user: null as { id: string; email: string } | null,
	ensureRunning: vi.fn(),
	ticket: vi.fn(),
	getDeviceInfo: vi.fn(),
	storeGet: vi.fn(),
	storeSet: vi.fn(),
}));

vi.mock("bridge/localCli", () => ({
	default: {
		ensureRunning: mocks.ensureRunning,
		ticket: mocks.ticket,
	},
}));
vi.mock("bridge/native", () => ({
	default: { getDeviceInfo: mocks.getDeviceInfo },
}));
vi.mock("lib/auth", () => ({
	getAccessTokenForAuth: vi.fn(),
	getAuthenticatedUserForAuth: () => mocks.user,
}));
vi.mock("lib/e2ee", () => ({
	decryptMessage: vi.fn(),
	decryptProxyBinaryFrame: vi.fn(),
	encryptMessage: vi.fn(),
	isPlaintextMessage: vi.fn(() => false),
	keyFromBase64: vi.fn(),
}));
vi.mock("lib/settings", () => ({
	getBaseServerUrl: vi.fn(),
}));
vi.mock("lib/store", () => ({
	get: mocks.storeGet,
	set: mocks.storeSet,
}));

import { connectToLocal } from "./connection";

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("VERSION", "0.0.36");
	vi.stubEnv("VERSION_CODE", "36");
	mocks.user = null;
	mocks.ensureRunning.mockResolvedValue({});
	mocks.getDeviceInfo.mockResolvedValue({
		model: "MacBook Pro",
		manufacturer: "Apple",
		isEmulator: false,
	});
	mocks.storeGet.mockResolvedValue("c_local-test");
	mocks.ticket.mockRejectedValue(new Error("stop after ticket"));
});

describe("local connection authentication", () => {
	it("fails before invoking the local bridge when no user is authenticated", async () => {
		await expect(connectToLocal()).rejects.toThrow(
			"Sign in again to connect locally.",
		);
		expect(mocks.ensureRunning).not.toHaveBeenCalled();
		expect(mocks.ticket).not.toHaveBeenCalled();
	});

	it("includes the verified user identity in the local ticket", async () => {
		mocks.user = { id: "user_123", email: "developer@example.com" };

		await expect(connectToLocal()).rejects.toThrow("stop after ticket");
		expect(mocks.ticket).toHaveBeenCalledWith({
			clientId: "c_local-test",
			appVersion: "0.0.36 (36)",
			platform: "macos",
			deviceModel: "MacBook Pro",
			deviceIsEmulator: false,
			deviceManufacturer: "Apple",
			user: {
				id: "user_123",
				email: "developer@example.com",
			},
		});
	});
});
