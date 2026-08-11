import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("App", () => ({ pushPage: vi.fn() }));
vi.mock("components/RatingDialog", () => ({ default: () => null }));
vi.mock("components/TabPageHeader", () => ({ default: () => null }));
vi.mock("pages/about", () => ({ default: () => null }));
vi.mock("pages/ports", () => ({ default: () => null }));
vi.mock("pages/reach-out", () => ({ default: () => null }));
vi.mock("pages/settings", () => ({ default: () => null }));
vi.mock("workbench/openers", () => ({
	tryOpenUtilitySurface: () => false,
}));

import MoreTab from ".";

afterEach(cleanup);

describe("MoreTab", () => {
	it("uses semantic card subtext for every tile description", () => {
		render(<MoreTab />);

		for (const description of [
			"View and manage open ports",
			"App preferences and configuration",
			"Contact us, report an issue, or say hi",
			"Version info and licenses",
		]) {
			expect(screen.getByText(description)).toHaveClass("card-subtext");
		}
	});
});
