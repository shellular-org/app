import { describe, expect, it, vi } from "vitest";
import { resolveOnboardingVisibility } from "./onboarding";

describe("resolveOnboardingVisibility", () => {
	it("disables onboarding on macOS without reading completion state", async () => {
		const readCompletion = vi.fn<() => Promise<boolean | null>>();

		await expect(
			resolveOnboardingVisibility({ isMacos: true, readCompletion }),
		).resolves.toBe(false);
		expect(readCompletion).not.toHaveBeenCalled();
	});

	it("shows onboarding on other platforms when it is incomplete", async () => {
		await expect(
			resolveOnboardingVisibility({
				isMacos: false,
				readCompletion: async () => null,
			}),
		).resolves.toBe(true);
	});

	it("hides onboarding on other platforms after completion", async () => {
		await expect(
			resolveOnboardingVisibility({
				isMacos: false,
				readCompletion: async () => true,
			}),
		).resolves.toBe(false);
	});
});
