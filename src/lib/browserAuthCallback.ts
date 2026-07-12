export const BROWSER_AUTH_CALLBACK_TYPE = "shellular-auth-callback";
export const BROWSER_AUTH_REQUEST_ID_PARAM = "authRequestId";

export type BrowserAuthCallbackMessage = {
	type: typeof BROWSER_AUTH_CALLBACK_TYPE;
	requestId: string;
	url: string;
};

export function createBrowserAuthCallbackMessage(
	callbackUrl: string,
): BrowserAuthCallbackMessage | null {
	try {
		const url = new URL(callbackUrl);
		const requestId = url.searchParams.get(BROWSER_AUTH_REQUEST_ID_PARAM);
		if (!requestId) return null;
		return { type: BROWSER_AUTH_CALLBACK_TYPE, requestId, url: url.toString() };
	} catch {
		return null;
	}
}

export function isValidBrowserAuthCallbackMessage(
	data: unknown,
	expectedOrigin: string,
	expectedPathname: string,
	expectedRequestId: string,
): data is BrowserAuthCallbackMessage {
	if (
		typeof data !== "object" ||
		data === null ||
		!("type" in data) ||
		data.type !== BROWSER_AUTH_CALLBACK_TYPE ||
		!("requestId" in data) ||
		data.requestId !== expectedRequestId ||
		!("url" in data) ||
		typeof data.url !== "string"
	) {
		return false;
	}

	try {
		const url = new URL(data.url);
		return (
			url.origin === expectedOrigin &&
			url.pathname === expectedPathname &&
			url.searchParams.get("shellularAuthCallback") === "1" &&
			url.searchParams.get(BROWSER_AUTH_REQUEST_ID_PARAM) === expectedRequestId
		);
	} catch {
		return false;
	}
}
