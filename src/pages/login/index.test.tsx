import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import actionStack from "lib/actionStack";
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

vi.mock("pages/settings", () => ({
	default: ({
		initialTab,
		onServerSaved,
	}: {
		initialTab: string;
		onServerSaved: () => void;
	}) => (
		<div>
			<span>Settings category: {initialTab}</span>
			<button type="button" onClick={onServerSaved}>
				Save server
			</button>
		</div>
	),
}));

afterEach(() => {
	cleanup();
	actionStack.clear();
	vi.unstubAllEnvs();
});

describe("development login settings", () => {
	it("opens the Network settings and returns to login through Back", async () => {
		vi.stubEnv("DEV_MODE", "true");
		render(<LoginPage onReload={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: "Settings" }));

		expect(screen.getByText("Settings category: network")).toBeVisible();
		expect(actionStack.has("dev-login-settings")).toBe(true);

		await act(async () => {
			await actionStack.pop();
		});

		expect(screen.getByText("Welcome to Shellular")).toBeVisible();
		expect(actionStack.has("dev-login-settings")).toBe(false);
	});

	it("reloads login authentication after the server is saved", () => {
		vi.stubEnv("DEV_MODE", "true");
		const onReload = vi.fn();
		render(<LoginPage onReload={onReload} />);

		fireEvent.click(screen.getByRole("button", { name: "Settings" }));
		fireEvent.click(screen.getByRole("button", { name: "Save server" }));

		expect(onReload).toHaveBeenCalledOnce();
	});

	it("does not expose the settings shortcut outside development", () => {
		vi.stubEnv("DEV_MODE", "");
		render(<LoginPage onReload={vi.fn()} />);

		expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
	});
});
