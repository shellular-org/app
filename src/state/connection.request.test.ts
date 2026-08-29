import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("bridge/localCli", () => ({ default: {} }));
vi.mock("bridge/native", () => ({ default: {} }));
vi.mock("lib/auth", () => ({
	getAccessTokenForAuth: vi.fn(),
	getAuthenticatedUserForAuth: vi.fn(),
}));
vi.mock("lib/e2ee", () => ({
	decryptMessage: vi.fn(),
	decryptProxyBinaryFrame: vi.fn(),
	encryptMessage: vi.fn(),
	isPlaintextMessage: vi.fn(() => false),
	keyFromBase64: vi.fn(),
}));
vi.mock("lib/settings", () => ({ getBaseServerUrl: vi.fn() }));
vi.mock("lib/store", () => ({ get: vi.fn(), set: vi.fn() }));

import { MsgType } from "@shellular/protocol";
import { Connection, type SendableMsg } from "./connection";

afterEach(() => {
	vi.useRealTimers();
});

describe("connection request controls", () => {
	it("uses a per-request timeout", async () => {
		vi.useFakeTimers();
		const connection = new Connection("https://example.test");
		vi.spyOn(connection, "send").mockReturnValue("request-1");
		const result = connection.sendRequest(request(), { timeoutMs: 25 });
		await vi.advanceTimersByTimeAsync(25);
		await expect(result).resolves.toMatchObject({ error: "Request timed out" });
	});

	it("settles immediately when aborted and ignores later timeouts", async () => {
		vi.useFakeTimers();
		const connection = new Connection("https://example.test");
		vi.spyOn(connection, "send").mockReturnValue("request-2");
		const controller = new AbortController();
		const result = connection.sendRequest(request(), {
			timeoutMs: 100,
			signal: controller.signal,
		});
		controller.abort();
		await expect(result).resolves.toMatchObject({ error: "Request aborted" });
		await vi.advanceTimersByTimeAsync(100);
	});
});

function request(): SendableMsg {
	return { type: MsgType.FS_LIST, data: { path: "." } };
}
