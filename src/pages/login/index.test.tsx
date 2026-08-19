import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from ".";

const authState = vi.hoisted(() => ({
	providers: [],
	error: "Sign-in is unavailable right now. Please try again later.",
	signingInProvider: null,
	signIn: vi.fn(),
}));

vi.mock("lib/auth", () => ({
	useAuth: () => authState,
}));

vi.mock("lib/utils", () => ({
	getOnlineStatus: () => true,
}));

vi.mock("bridge/native", () => ({
	default: { openInBrowser: vi.fn() },
}));

vi.mock("components/OfflineBanner", () => ({
	default: () => null,
}));

vi.mock("components/BottomSheet", () => ({
	default: () => null,
}));

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe("development login settings", () => {
	it("delegates the settings shortcut to the authentication gate", () => {
		vi.stubEnv("DEV_MODE", "true");
		const onOpenSettings = vi.fn();
		render(<LoginPage onOpenSettings={onOpenSettings} />);

		fireEvent.click(screen.getByRole("button", { name: "Settings" }));

		expect(onOpenSettings).toHaveBeenCalledOnce();
	});

	it("does not expose the settings shortcut outside development", () => {
		vi.stubEnv("DEV_MODE", "");
		render(<LoginPage onOpenSettings={vi.fn()} />);

		expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
	});
});
