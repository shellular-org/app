import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "./history";

const mocks = vi.hoisted(() => ({
	history: [] as HistoryEntry[],
}));

vi.mock("./history", () => ({
	getBrowserHistory: () => mocks.history,
}));

import { getBrowserHomeDocument } from "./homeDocument";

describe("browser home document", () => {
	beforeEach(() => {
		mocks.history = [];
	});

	it("produces a complete searchable home document without history", () => {
		const document = getBrowserHomeDocument("host-1");

		expect(document).toContain("<!DOCTYPE html>");
		expect(document).toContain("Search or enter address");
		expect(document).toContain("No browsing history yet");
	});

	it("includes current history in the generated document", () => {
		mocks.history = [
			{
				url: "https://example.test/path?value=1&next=2",
				title: "Example <Project>",
				favicon: "",
				timestamp: Date.now(),
			},
		];

		const document = getBrowserHomeDocument("host-1");
		expect(document).toContain("Example &lt;Project&gt;");
		expect(document).toContain("https://example.test/path?value=1&amp;next=2");
	});
});
