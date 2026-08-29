import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("tabs/agents", () => ({
	default: () => <div>Agents utility loaded</div>,
}));

import SurfaceRenderer from "./SurfaceRenderer";

afterEach(cleanup);

describe("SurfaceRenderer utility loading", () => {
	it("opens Agents through the retryable utility surface", async () => {
		render(
			<SurfaceRenderer
				surface={{
					kind: "utility",
					id: "utility:agents",
					page: "agents",
					title: "Agents",
					icon: "icon-ai-chat",
					showConnectionBanner: true,
				}}
			/>,
		);

		expect(await screen.findByText("Agents utility loaded")).toBeVisible();
	});
});
