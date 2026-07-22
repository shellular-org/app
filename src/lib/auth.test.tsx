import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	secureGet: vi.fn(),
	secureSet: vi.fn(),
	secureRemove: vi.fn(),
	fetch: vi.fn(),
}));

vi.mock("bridge/browser", () => ({
	default: { openForAuth: vi.fn() },
}));
vi.mock("bridge/native", () => ({
	default: { getAppInfo: vi.fn() },
}));
vi.mock("bridge/secureStore", () => ({
	default: {
		get: mocks.secureGet,
		set: mocks.secureSet,
		remove: mocks.secureRemove,
	},
}));
vi.mock("lib/settings", () => ({
	getBaseServerUrl: vi.fn(async () => "https://server.shellular.dev"),
}));

import { AuthProvider, getAuthenticatedUserForAuth, useAuth } from "./auth";

const user = {
	id: "user_123",
	email: "developer@example.com",
	name: "Developer",
	avatarUrl: null,
	linkedAccounts: [],
};

function Probe() {
	const { status, logout } = useAuth();
	return (
		<>
			<span>{status}</span>
			<button type="button" onClick={() => void logout()}>
				Logout
			</button>
		</>
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("PLATFORM", "macos");
	mocks.secureGet.mockResolvedValue("refresh-token");
	mocks.secureSet.mockResolvedValue(undefined);
	mocks.secureRemove.mockResolvedValue(undefined);
	mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
		const path = new URL(String(input)).pathname;
		const data =
			path === "/auth/providers"
				? { providers: [] }
				: path === "/auth/refresh"
					? {
							accessToken: "access-token",
							accessTokenExpiresAt: Date.now() + 3_600_000,
							refreshToken: "next-refresh-token",
							refreshTokenExpiresAt: Date.now() + 7_200_000,
							user,
						}
					: {};
		return {
			ok: true,
			json: async () => ({ success: true, data }),
		} as Response;
	});
	vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("authenticated user snapshot", () => {
	it("tracks the verified session and clears it on logout", async () => {
		render(
			<AuthProvider>
				<Probe />
			</AuthProvider>,
		);

		await screen.findByText("authenticated");
		expect(getAuthenticatedUserForAuth()).toEqual({
			id: user.id,
			email: user.email,
		});

		fireEvent.click(screen.getByRole("button", { name: "Logout" }));
		await waitFor(() =>
			expect(screen.getByText("unauthenticated")).toBeVisible(),
		);
		expect(getAuthenticatedUserForAuth()).toBeNull();
		expect(mocks.secureRemove).toHaveBeenCalledWith("auth-refresh-token");
	});
});
