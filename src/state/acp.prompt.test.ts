import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	onMessage: vi.fn(),
	sendMessage: vi.fn(),
	sendRequest: vi.fn(),
}));

vi.mock("./connection", () => mocks);

import { type AcpPromptCallbacks, acpPrompt, acpQueuePrompt } from "./acp";

const callbacks: AcpPromptCallbacks = {
	onToken: vi.fn(),
	onMessage: vi.fn(),
	onEnd: vi.fn(),
	onError: vi.fn(),
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.onMessage.mockReturnValue(vi.fn());
});

describe("ACP prompt dispatch", () => {
	it("throws when a direct prompt cannot reach the local connection", () => {
		const unsubscribe = vi.fn();
		mocks.onMessage.mockReturnValue(unsubscribe);
		mocks.sendMessage.mockReturnValue(null);

		expect(() => acpPrompt("codex", "session-1", "hello", callbacks)).toThrow(
			"Unable to send prompt",
		);
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(callbacks.onError).not.toHaveBeenCalled();
	});

	it("throws when a queued prompt cannot reach the local connection", () => {
		mocks.sendMessage.mockReturnValue(null);

		expect(() => acpQueuePrompt("codex", "session-1", "hello")).toThrow(
			"Unable to send prompt",
		);
	});

	it("returns a cleanup after a direct prompt is accepted", () => {
		const unsubscribe = vi.fn();
		mocks.onMessage.mockReturnValue(unsubscribe);
		mocks.sendMessage.mockReturnValue("message-1");

		const cleanup = acpPrompt("codex", "session-1", "hello", callbacks);
		cleanup();

		expect(unsubscribe).toHaveBeenCalledOnce();
	});
});
