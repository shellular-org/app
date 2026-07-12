import { isValidBrowserAuthCallbackMessage } from "lib/browserAuthCallback";

type ActiveAuthAttempt = {
	popup: Window;
	onMessage: (event: MessageEvent) => void;
	callback: Callback;
	closeInterval: number;
	timeout: number;
};

let activeAuthAttempt: ActiveAuthAttempt | null = null;

export default {
	open(callback: Callback, args: unknown[]) {
		const url = args[0] as string;
		if (!url) {
			callback.error("Missing URL");
			return;
		}
		window.open(url, "_blank");
		callback.success();
	},

	openForAuth(callback: Callback, args: unknown[]) {
		const url = args[0] as string;
		const callbackTarget = args[1] as string | undefined;
		const requestId = args[3] as string | undefined;
		if (!url) {
			callback.error("Missing URL");
			return;
		}
		const target = parseWebCallbackTarget(callbackTarget);
		if (!target || !requestId) {
			callback.error("Invalid browser auth callback configuration");
			return;
		}

		cancelActiveAuthAttempt();
		const popup = window.open(url, "shellular-oauth", popupFeatures(520, 720));
		if (!popup) {
			callback.error("Popup blocked");
			return;
		}
		popup.focus();
		let didFinish = false;

		const finish = (error?: string, authUrl?: string) => {
			if (didFinish) return;
			didFinish = true;
			cleanupAuthAttempt(onMessage, closeInterval, timeout);
			if (error) {
				callback.error(error);
				return;
			}
			popup.close();
			callback.success(
				JSON.stringify({ url: authUrl, params: params(authUrl as string) }),
			);
		};

		const onMessage = (event: MessageEvent) => {
			if (
				event.origin !== target.origin ||
				event.source !== popup ||
				!isValidBrowserAuthCallbackMessage(
					event.data,
					target.origin,
					target.pathname,
					requestId,
				)
			) {
				return;
			}

			finish(undefined, event.data.url);
		};
		const closeInterval = window.setInterval(() => {
			if (popup.closed) finish("Auth cancelled");
		}, 500);
		const timeout = window.setTimeout(
			() => finish("Auth timed out"),
			5 * 60 * 1000,
		);

		activeAuthAttempt = { popup, onMessage, callback, closeInterval, timeout };
		window.addEventListener("message", onMessage);
	},
};

function cancelActiveAuthAttempt() {
	if (!activeAuthAttempt) return;
	window.removeEventListener("message", activeAuthAttempt.onMessage);
	window.clearInterval(activeAuthAttempt.closeInterval);
	window.clearTimeout(activeAuthAttempt.timeout);
	activeAuthAttempt.popup.close();
	activeAuthAttempt.callback.error("Auth superseded");
	activeAuthAttempt = null;
}

function cleanupAuthAttempt(
	onMessage: (event: MessageEvent) => void,
	closeInterval: number,
	timeout: number,
) {
	window.removeEventListener("message", onMessage);
	window.clearInterval(closeInterval);
	window.clearTimeout(timeout);
	if (activeAuthAttempt?.onMessage === onMessage) activeAuthAttempt = null;
}

function parseWebCallbackTarget(
	callbackTarget: string | undefined,
): URL | null {
	if (!callbackTarget) return null;
	try {
		const url = new URL(callbackTarget);
		return url.protocol === "http:" || url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}

function popupFeatures(width: number, height: number): string {
	const left = Math.max(
		0,
		Math.round(window.screenX + (window.outerWidth - width) / 2),
	);
	const top = Math.max(
		0,
		Math.round(window.screenY + (window.outerHeight - height) / 2),
	);
	return [
		"popup=yes",
		`width=${width}`,
		`height=${height}`,
		`left=${left}`,
		`top=${top}`,
		"resizable=yes",
		"scrollbars=yes",
	].join(",");
}

function params(url: string): Record<string, string> {
	return Object.fromEntries(new URL(url).searchParams.entries());
}
