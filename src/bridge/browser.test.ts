import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	call: vi.fn(async () => undefined),
	snapshot: {
		connectionStatus: "connected",
		transport: "local",
		hostInfo: {
			id: "host-1",
			hostname: "This Mac",
			capabilities: undefined as { tcpTunnel?: 1 } | undefined,
		},
	},
	theme: { json: { primary: "#101010" } as Record<string, string> },
}));

vi.mock("./bridge", () => ({
	default: () => mocks.call,
}));
vi.mock("state/connection", () => ({
	getConnectionSnapshot: () => mocks.snapshot,
}));
vi.mock("themes", () => ({
	default: {
		get current() {
			return mocks.theme;
		},
	},
}));
vi.mock("../browser/homeDocument", () => ({
	getBrowserHomeDocument: () => "<html>Home</html>",
}));

import browser from "./browser";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.snapshot.transport = "local";
	mocks.snapshot.hostInfo.capabilities = undefined;
	mocks.theme.json = { primary: "#101010" };
});

describe("native browser bridge", () => {
	it("passes a ready Home document when opening the browser", async () => {
		await browser.open();

		expect(mocks.call).toHaveBeenCalledWith("open", [
			undefined,
			{ primary: "#101010" },
			{
				status: "connected",
				transport: "local",
				hostId: "host-1",
				hostName: "This Mac",
			},
			"<html>Home</html>",
		]);
	});

	it("refreshes the cached Home document with native theme updates", async () => {
		mocks.theme.json = {
			primary: "#202020",
			surfaceSoft: "#303030",
			lineSoft: "#404040",
		};
		await browser.syncTheme();

		expect(mocks.call).toHaveBeenCalledWith("setTheme", [
			{
				primary: "#202020",
				surfaceSoft: "#303030",
				lineSoft: "#404040",
			},
			"<html>Home</html>",
		]);
	});

	it("advertises remote TCP tunnel support to the native browser", async () => {
		mocks.snapshot.transport = "remote";
		mocks.snapshot.hostInfo.capabilities = { tcpTunnel: 1 };

		await browser.syncConnectionContext();

		expect(mocks.call).toHaveBeenCalledWith("setContext", [
			{
				status: "connected",
				transport: "remote",
				hostId: "host-1",
				hostName: "This Mac",
				tcpTunnelVersion: 1,
			},
		]);
	});
});
