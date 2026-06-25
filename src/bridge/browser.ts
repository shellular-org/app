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

	async openForAuth(
		url: string,
		callbackScheme?: string,
		useSafari = true,
	): Promise<AuthResult> {
		const result = await browser("openForAuth", [
			url,
			callbackScheme,
			useSafari,
		]);
		if (typeof result === "string") {
			try {
				return JSON.parse(result) as AuthResult;
			} catch {
				return { url: result, params: {} };
			}
		}
		return result as AuthResult;
	},
};
