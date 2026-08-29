import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RetryableLazySurface, {
	isChunkLoadError,
	loadLazySurfaceWithRetry,
} from "./RetryableLazySurface";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("RetryableLazySurface", () => {
	it("recognizes browser and webpack chunk failures", () => {
		expect(
			isChunkLoadError(
				new Error("Loading chunk src_pages_sessions_style_scss failed."),
			),
		).toBe(true);
		expect(
			isChunkLoadError(
				new TypeError("Failed to fetch dynamically imported module"),
			),
		).toBe(true);
		expect(isChunkLoadError(new Error("Component render failed"))).toBe(false);
	});

	it("retries a chunk once but does not retry other failures", async () => {
		const chunkLoader = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new Error("Loading chunk agents failed"))
			.mockResolvedValueOnce("loaded");
		await expect(loadLazySurfaceWithRetry(chunkLoader, 0)).resolves.toBe(
			"loaded",
		);
		expect(chunkLoader).toHaveBeenCalledTimes(2);

		const renderLoader = vi
			.fn<() => Promise<string>>()
			.mockRejectedValue(new Error("render failed"));
		await expect(loadLazySurfaceWithRetry(renderLoader, 0)).rejects.toThrow(
			"render failed",
		);
		expect(renderLoader).toHaveBeenCalledOnce();
	});

	it("contains a repeated failure and creates a fresh lazy load on retry", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const loader = vi
			.fn()
			.mockRejectedValueOnce(new Error("Loading chunk agents failed"))
			.mockRejectedValueOnce(new Error("Loading chunk agents failed"))
			.mockResolvedValue({ default: () => <div>Agents loaded</div> });

		render(<RetryableLazySurface loader={loader} title="Agents" />);
		expect(
			await screen.findByText("Unable to load Agents", undefined, {
				timeout: 1500,
			}),
		).toBeVisible();
		expect(loader).toHaveBeenCalledTimes(2);

		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() =>
			expect(screen.getByText("Agents loaded")).toBeVisible(),
		);
		expect(loader).toHaveBeenCalledTimes(3);
	});
});
