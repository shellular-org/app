import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addBrowserHistory, getBrowserHistory, HISTORY_KEY } from "./history";

describe("browser history", () => {
	const hostId = "host-1";
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
	});
	afterEach(() => vi.useRealTimers());

	it("keeps fifty recent unique entries instead of truncating existing history early", () => {
		const existing = Array.from({ length: 50 }, (_, index) => ({
			url: `https://example.com/${index}`,
			title: `Page ${index}`,
			favicon: "",
			timestamp: index,
		}));
		localStorage.setItem(`${HISTORY_KEY}:${hostId}`, JSON.stringify(existing));

		addBrowserHistory(hostId, {
			url: "https://new.example.com",
			title: "New page",
			favicon: "",
		});

		const history = getBrowserHistory(hostId);
		expect(history).toHaveLength(50);
		expect(history[0]).toMatchObject({
			url: "https://new.example.com",
			title: "New page",
		});
		expect(history[history.length - 1]?.url).toBe("https://example.com/48");
	});

	it("moves a revisited address to the front without duplicating it", () => {
		addBrowserHistory(hostId, {
			url: "https://one.test",
			title: "One",
			favicon: "",
		});
		addBrowserHistory(hostId, {
			url: "https://two.test",
			title: "Two",
			favicon: "",
		});
		addBrowserHistory(hostId, {
			url: "https://one.test",
			title: "One updated",
			favicon: "icon",
		});

		expect(getBrowserHistory(hostId)).toEqual([
			expect.objectContaining({
				url: "https://one.test",
				title: "One updated",
				favicon: "icon",
			}),
			expect.objectContaining({ url: "https://two.test" }),
		]);
	});

	it("isolates history by host", () => {
		addBrowserHistory("host-a", {
			url: "https://a.test",
			title: "A",
			favicon: "",
		});
		expect(getBrowserHistory("host-b")).toEqual([]);
	});
});
