import { getConnectionSnapshot } from "state/connection";
import themes from "themes";
import { getBrowserHomeDocument } from "../browser/homeDocument";
import bridge from "./bridge";

export type AuthResult = {
	url: string;
	params: Record<string, string>;
};

const browser = bridge("Browser");

export type BrowserConnectionContext = {
	status: "disconnected" | "connecting" | "connected" | "reconnecting";
	transport: "local" | "remote" | null;
	hostId?: string;
	hostName?: string;
};

function connectionContext(): BrowserConnectionContext {
	const snapshot = getConnectionSnapshot();
	return {
		status: snapshot.connectionStatus,
		transport: snapshot.transport,
		hostId: snapshot.hostInfo?.id,
		hostName: snapshot.hostInfo?.hostname,
	};
}

export default {
	open(url?: string): Promise<void> {
		const t =
			(themes.current?.json as Record<string, string> | undefined) ?? {};
		return browser("open", [
			url,
			t,
			connectionContext(),
			getBrowserHomeDocument(),
		]) as Promise<void>;
	},

	openHTML(html: string): Promise<void> {
		const t =
			(themes.current?.json as Record<string, string> | undefined) ?? {};
		return browser("openHTML", [
			html,
			t,
			connectionContext(),
			getBrowserHomeDocument(),
		]) as Promise<void>;
	},

	syncConnectionContext(): Promise<void> {
		return browser("setContext", [connectionContext()]) as Promise<void>;
	},

	syncTheme(): Promise<void> {
		const theme =
			(themes.current?.json as Record<string, string> | undefined) ?? {};
		return browser("setTheme", [
			theme,
			getBrowserHomeDocument(),
		]) as Promise<void>;
	},

	async openForAuth(
		url: string,
		callbackScheme?: string,
		useSafari = true,
		requestId?: string,
	): Promise<AuthResult> {
		const result = await browser("openForAuth", [
			url,
			callbackScheme,
			useSafari,
			requestId,
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
