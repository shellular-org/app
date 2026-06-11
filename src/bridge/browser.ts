import themes from "themes";
import bridge from "./bridge";

export type AuthResult = {
	url: string;
	params: Record<string, string>;
};

const browser = bridge("Browser");

export default {
	open(url?: string): Promise<void> {
		const t =
			(themes.current?.json as Record<string, string> | undefined) ?? {};
		return browser("open", [url, t]) as Promise<void>;
	},

	openHTML(html: string): Promise<void> {
		const t =
			(themes.current?.json as Record<string, string> | undefined) ?? {};
		return browser("openHTML", [html, t]) as Promise<void>;
	},

	openForAuth(
		url: string,
		callbackScheme?: string,
		useSafari = true,
	): Promise<AuthResult> {
		return browser("openForAuth", [
			url,
			callbackScheme,
			useSafari,
		]) as Promise<AuthResult>;
	},
};
