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
		const callbackScheme = (args[1] as string | undefined) ?? "shellular";
		if (!url) {
			callback.error("Missing URL");
			return;
		}
		const popup = window.open(url, "_blank");
		if (!popup) {
			callback.error("Popup blocked");
			return;
		}
		const authPopup = popup;
		const timeout = window.setTimeout(
			() => {
				cleanup();
				callback.error("Auth timed out");
			},
			5 * 60 * 1000,
		);

		const interval = window.setInterval(() => {
			if (authPopup.closed) {
				cleanup();
				callback.error("Auth cancelled");
				return;
			}
			try {
				const href = authPopup.location.href;
				if (href.startsWith(`${callbackScheme}://`)) {
					finish(href);
				}
			} catch {
				// Cross-origin during provider login.
			}
		}, 500);

		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string; url?: string };
			if (data?.type === "shellular-auth-callback" && data.url) {
				finish(data.url);
			}
		};

		window.addEventListener("message", onMessage);

		function finish(authUrl: string) {
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
			window.clearInterval(interval);
			window.removeEventListener("message", onMessage);
		}
	},
};

function params(url: string): Record<string, string> {
	try {
		return Object.fromEntries(new URL(url).searchParams.entries());
	} catch {
		return {};
	}
}
