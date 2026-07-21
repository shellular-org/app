const MOBILE_WEB_QUERY = "(hover: none) and (pointer: coarse)";

export function shouldUseMonacoEditor(
	isDesktopUI = process.env.IS_DESKTOP_UI,
	isBrowser = process.env.IS_BROWSER,
	matchesMobileWeb = typeof window !== "undefined" &&
		window.matchMedia(MOBILE_WEB_QUERY).matches,
) {
	return Boolean(isDesktopUI && !(isBrowser && matchesMobileWeb));
}
