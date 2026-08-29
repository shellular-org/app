import browser from "bridge/browser";
import { openWorkbenchSurface } from "./store";

export function openBrowserSurface(url: string, title?: string) {
	if (!process.env.IS_DESKTOP_UI || process.env.IS_MACOS) {
		return browser.open(url);
	}
	openWorkbenchSurface({
		kind: "browser",
		id: `browser:${url}`,
		title: title ?? titleFromUrl(url),
		icon: "icon-globe",
		url,
		showConnectionBanner: false,
	});
	return Promise.resolve();
}

function titleFromUrl(url: string) {
	try {
		const parsed = new URL(url);
		return parsed.hostname || parsed.pathname || "Browser";
	} catch {
		return url || "Browser";
	}
}
