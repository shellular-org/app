import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { saveSettings } from "lib/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from ".";

vi.mock("components/Page", () => ({
	default: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("lib/settings", async (importOriginal) => {
	const original = await importOriginal<typeof import("lib/settings")>();
	return {
		...original,
		loadSettings: vi.fn(async () => ({
			theme: "dark",
			server: {
				protocol: "https",
				domain: "server.shellular.dev",
			},
			editor: original.DEFAULT_EDITOR_SETTINGS,
			terminal: original.DEFAULT_TERMINAL_SETTINGS,
			startup: original.DEFAULT_STARTUP_SETTINGS,
			showHiddenFiles: false,
			hapticFeedback: true,
		})),
		saveSettings: vi.fn(async () => undefined),
	};
});

vi.mock("lib/store", () => ({
	get: vi.fn(async () => true),
	set: vi.fn(async () => undefined),
	remove: vi.fn(async () => undefined),
}));

vi.mock("lib/toast", () => ({
	default: vi.fn(),
}));

vi.mock("state", () => ({
	useShellular: () => ({
		savedHosts: [],
		agents: {},
		projects: [],
		connectionStatus: "disconnected",
	}),
}));

vi.mock("themes", () => ({
	default: {
		current: { name: "dark" },
		currentId: "dark",
		list: ["Dark"],
		options: [{ id: "dark", label: "Dark", type: "dark" }],
		resolveId: (name: string) => name,
		applyTheme: vi.fn(async () => undefined),
	},
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllEnvs();
});

describe("SettingsPage initial category", () => {
	it("opens Network directly and reports a successful server save", async () => {
		const onServerSaved = vi.fn();
		render(<SettingsPage initialTab="network" onServerSaved={onServerSaved} />);

		expect(screen.getByText("Base domain")).toBeVisible();
		expect(screen.queryByText("Application Theme")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(saveSettings).toHaveBeenCalledWith({
				server: {
					protocol: "https",
					domain: "server.shellular.dev",
				},
			});
		});
		expect(onServerSaved).toHaveBeenCalledOnce();
	});
});
