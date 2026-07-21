import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	call: vi.fn(async () => undefined),
}));

vi.mock("./bridge", () => ({
	default: () => mocks.call,
}));
vi.mock("state/connection", () => ({
	getConnectionSnapshot: () => ({
		connectionStatus: "connected",
		transport: "local",
		hostInfo: { id: "host-1", hostname: "This Mac" },
	}),
}));
vi.mock("themes", () => ({
	default: { current: { json: { primary: "#101010" } } },
}));
vi.mock("../browser/homeDocument", () => ({
	getBrowserHomeDocument: () => "<html>Home</html>",
}));

import browser from "./browser";

beforeEach(() => vi.clearAllMocks());

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
		await browser.syncTheme();

		expect(mocks.call).toHaveBeenCalledWith("setTheme", [
			{ primary: "#101010" },
			"<html>Home</html>",
		]);
	});
});
