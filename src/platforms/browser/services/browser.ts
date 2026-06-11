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
		if (!url) {
			callback.error("Missing URL");
			return;
		}
		const popup = window.open(url, "_blank");
		if (!popup) {
			callback.error("Popup blocked");
			return;
		}
		// Browser platform cannot intercept auth callbacks the same way
		// The popup handles the OAuth flow and returns via postMessage or redirect
		callback.success(JSON.stringify({ url, params: {} }));
	},
};
