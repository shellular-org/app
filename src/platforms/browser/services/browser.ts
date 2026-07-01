const AUTH_CALLBACK_MESSAGE_TYPE = "shellular-auth-callback";
const AUTH_CHANNEL_NAME = "shellular-auth";
const AUTH_STORAGE_KEY = "shellular:auth-callback";

type AuthCallbackPayload = {
	type?: string;
	url?: string;
};

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
		const callbackTarget = (args[1] as string | undefined) ?? "shellular";
		if (!url) {
			callback.error("Missing URL");
			return;
		}
		const popup = window.open(url, "shellular-oauth", popupFeatures(520, 720));
		if (!popup) {
			callback.error("Popup blocked");
			return;
		}
		popup.focus();
		const authPopup = popup;
		let didFinish = false;
		let closeGraceTimer: number | null = null;
		const timeout = window.setTimeout(
			() => {
				cleanup();
				callback.error("Auth timed out");
			},
			5 * 60 * 1000,
		);

		const interval = window.setInterval(() => {
			if (authPopup.closed) {
				startCloseGraceTimer();
				return;
			}
			try {
				const href = authPopup.location.href;
				if (isAuthCallbackUrl(href, callbackTarget)) {
					finish(href);
				}
			} catch {
				// Cross-origin during provider login.
			}
		}, 500);

		const onMessage = (event: MessageEvent) => {
			const data = event.data as AuthCallbackPayload;
			if (
				isTrustedMessageOrigin(event.origin, callbackTarget) &&
				isValidAuthCallbackPayload(data, callbackTarget)
			) {
				finish(data.url);
			}
		};

		const authChannel = createAuthBroadcastChannel();
		const onChannelMessage = (event: MessageEvent) => {
			const data = event.data as AuthCallbackPayload;
			if (isValidAuthCallbackPayload(data, callbackTarget)) {
				finish(data.url);
			}
		};
		authChannel?.addEventListener("message", onChannelMessage);

		const onStorage = (event: StorageEvent) => {
			if (event.key !== AUTH_STORAGE_KEY || !event.newValue) {
				return;
			}
			const data = parseAuthCallbackPayload(event.newValue);
			if (isValidAuthCallbackPayload(data, callbackTarget)) {
				finish(data.url);
			}
		};

		window.addEventListener("message", onMessage);
		window.addEventListener("storage", onStorage);

		function finish(authUrl: string) {
			if (didFinish) return;
			didFinish = true;
			cleanup();
			try {
				authPopup.close();
			} catch {}
			callback.success(
				JSON.stringify({ url: authUrl, params: params(authUrl) }),
			);
		}

		function cleanup() {
			window.clearTimeout(timeout);
			if (closeGraceTimer !== null) {
				window.clearTimeout(closeGraceTimer);
			}
			window.clearInterval(interval);
			window.removeEventListener("message", onMessage);
			window.removeEventListener("storage", onStorage);
			authChannel?.removeEventListener("message", onChannelMessage);
			authChannel?.close();
		}

		function startCloseGraceTimer() {
			if (closeGraceTimer !== null) return;
			closeGraceTimer = window.setTimeout(() => {
				if (didFinish) return;
				cleanup();
				callback.error("Auth cancelled");
			}, 2000);
		}
	},
};

function isAuthCallbackUrl(url: string, callbackTarget: string): boolean {
	try {
		const parsed = new URL(url);
		const target = parseWebCallbackTarget(callbackTarget);
		if (target) {
			return (
				parsed.origin === target.origin &&
				parsed.pathname === target.pathname &&
				parsed.searchParams.get("shellularAuthCallback") === "1"
			);
		}

		if (parsed.hostname !== "auth-callback") return false;
		return (
			parsed.protocol === `${callbackTarget}:` ||
			parsed.protocol === "shellular:" ||
			parsed.protocol === "foxbiz:"
		);
	} catch {
		return false;
	}
}

function isTrustedMessageOrigin(
	origin: string,
	callbackTarget: string,
): boolean {
	const target = parseWebCallbackTarget(callbackTarget);
	return !target || origin === target.origin;
}

function parseWebCallbackTarget(callbackTarget: string): URL | null {
	try {
		const url = new URL(callbackTarget);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return url;
	} catch {
		return null;
	}
}

function createAuthBroadcastChannel(): BroadcastChannel | null {
	try {
		return new BroadcastChannel(AUTH_CHANNEL_NAME);
	} catch {
		return null;
	}
}

function isValidAuthCallbackPayload(
	data: AuthCallbackPayload | null,
	callbackTarget: string,
): data is AuthCallbackPayload & { url: string } {
	return (
		data?.type === AUTH_CALLBACK_MESSAGE_TYPE &&
		typeof data.url === "string" &&
		isAuthCallbackUrl(data.url, callbackTarget)
	);
}

function parseAuthCallbackPayload(value: string): AuthCallbackPayload | null {
	try {
		return JSON.parse(value) as AuthCallbackPayload;
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
		"toolbar=no",
		"menubar=no",
		"location=no",
		"status=no",
	].join(",");
}

function params(url: string): Record<string, string> {
	try {
		return Object.fromEntries(new URL(url).searchParams.entries());
	} catch {
		return {};
	}
}
