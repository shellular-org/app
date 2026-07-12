import { BROWSER_AUTH_CALLBACK_TYPE } from "lib/browserAuthCallback";
import { afterEach, describe, expect, it, vi } from "vitest";
import browserService from "./browser";

const callbackTarget = "https://app.shellular.dev/?shellularAuthCallback=1";

function callback() {
	return {
		success: vi.fn(),
		error: vi.fn(),
	} as unknown as Callback;
}

function popup() {
	return {
		closed: false,
		close: vi.fn(),
		focus: vi.fn(),
	} as unknown as Window;
}

function authMessage(requestId: string) {
	return {
		type: BROWSER_AUTH_CALLBACK_TYPE,
		requestId,
		url: `https://app.shellular.dev/?shellularAuthCallback=1&authRequestId=${requestId}&authenticated=1`,
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("browser openForAuth", () => {
	it("resolves and closes only for the matching popup message", () => {
		const authPopup = popup();
		vi.spyOn(window, "open").mockReturnValue(authPopup);
		const result = callback();
		browserService.openForAuth(result, [
			"https://accounts.example/oauth",
			callbackTarget,
			true,
			"request-1",
		]);

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: "https://app.shellular.dev",
				source: window,
				data: authMessage("request-1"),
			}),
		);
		expect(result.success).not.toHaveBeenCalled();

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: "https://app.shellular.dev",
				source: authPopup,
				data: authMessage("request-1"),
			}),
		);
		expect(result.success).toHaveBeenCalledTimes(1);
		expect(authPopup.close).toHaveBeenCalledTimes(1);

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: "https://app.shellular.dev",
				source: authPopup,
				data: authMessage("request-1"),
			}),
		);
		expect(result.success).toHaveBeenCalledTimes(1);
	});

	it("replaces an active attempt and ignores its stale callback", () => {
		const firstPopup = popup();
		const secondPopup = popup();
		vi.spyOn(window, "open")
			.mockReturnValueOnce(firstPopup)
			.mockReturnValueOnce(secondPopup);
		const first = callback();
		const second = callback();

		browserService.openForAuth(first, [
			"https://accounts.example/1",
			callbackTarget,
			true,
			"first",
		]);
		browserService.openForAuth(second, [
			"https://accounts.example/2",
			callbackTarget,
			true,
			"second",
		]);

		expect(firstPopup.close).toHaveBeenCalledTimes(1);
		expect(first.error).toHaveBeenCalledWith("Auth superseded");
		window.dispatchEvent(
			new MessageEvent("message", {
				origin: "https://app.shellular.dev",
				source: firstPopup,
				data: authMessage("first"),
			}),
		);
		expect(second.success).not.toHaveBeenCalled();

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: "https://app.shellular.dev",
				source: secondPopup,
				data: authMessage("second"),
			}),
		);
		expect(second.success).toHaveBeenCalledTimes(1);
	});

	it("rejects when the popup is closed", () => {
		vi.useFakeTimers();
		const authPopup = popup() as Window & { closed: boolean };
		vi.spyOn(window, "open").mockReturnValue(authPopup);
		const result = callback();
		browserService.openForAuth(result, [
			"https://accounts.example/oauth",
			callbackTarget,
			true,
			"request-close",
		]);

		authPopup.closed = true;
		vi.advanceTimersByTime(500);

		expect(result.error).toHaveBeenCalledWith("Auth cancelled");
	});

	it("rejects when authentication times out", () => {
		vi.useFakeTimers();
		const authPopup = popup();
		vi.spyOn(window, "open").mockReturnValue(authPopup);
		const result = callback();
		browserService.openForAuth(result, [
			"https://accounts.example/oauth",
			callbackTarget,
			true,
			"request-timeout",
		]);

		vi.advanceTimersByTime(5 * 60 * 1000);

		expect(result.error).toHaveBeenCalledWith("Auth timed out");
	});
});
