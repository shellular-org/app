import { describe, expect, it } from "vitest";
import {
	BROWSER_AUTH_CALLBACK_TYPE,
	createBrowserAuthCallbackMessage,
	isValidBrowserAuthCallbackMessage,
} from "./browserAuthCallback";

const origin = "https://app.shellular.dev";
const pathname = "/";
const requestId = "request-123";
const callbackUrl = `${origin}/?shellularAuthCallback=1&authRequestId=${requestId}&authenticated=1`;

describe("browser auth callback protocol", () => {
	it("creates the callback message from a valid callback URL", () => {
		expect(createBrowserAuthCallbackMessage(callbackUrl)).toEqual({
			type: BROWSER_AUTH_CALLBACK_TYPE,
			requestId,
			url: callbackUrl,
		});
	});

	it("rejects callback URLs without a request ID", () => {
		expect(
			createBrowserAuthCallbackMessage(
				`${origin}/?shellularAuthCallback=1&authenticated=1`,
			),
		).toBeNull();
	});

	it("accepts only the expected origin, path, request ID, and marker", () => {
		const message = createBrowserAuthCallbackMessage(callbackUrl);
		expect(
			isValidBrowserAuthCallbackMessage(message, origin, pathname, requestId),
		).toBe(true);
		expect(
			isValidBrowserAuthCallbackMessage(
				message,
				"https://evil.example",
				pathname,
				requestId,
			),
		).toBe(false);
		expect(
			isValidBrowserAuthCallbackMessage(message, origin, "/other", requestId),
		).toBe(false);
		expect(
			isValidBrowserAuthCallbackMessage(message, origin, pathname, "stale"),
		).toBe(false);
	});

	it("rejects malformed and unrelated messages", () => {
		expect(
			isValidBrowserAuthCallbackMessage(null, origin, pathname, requestId),
		).toBe(false);
		expect(
			isValidBrowserAuthCallbackMessage(
				{ type: "unrelated", requestId, url: callbackUrl },
				origin,
				pathname,
				requestId,
			),
		).toBe(false);
		expect(
			isValidBrowserAuthCallbackMessage(
				{
					type: BROWSER_AUTH_CALLBACK_TYPE,
					requestId,
					url: "not a URL",
				},
				origin,
				pathname,
				requestId,
			),
		).toBe(false);
	});
});
