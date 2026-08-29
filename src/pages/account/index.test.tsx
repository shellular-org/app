import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Page", () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("lib/auth", () => ({
	useAuth: () => ({
		user: {
			id: "user-123",
			email: "developer@example.com",
			name: "Developer",
			avatarUrl: null,
			linkedAccounts: [],
		},
		providers: [
			{ id: "google", enabled: true },
			{ id: "github", enabled: true },
			{ id: "apple", enabled: true },
		],
		accountError: null,
		accountAction: null,
		linkAccount: vi.fn(),
		unlinkAccount: vi.fn(),
		logout: vi.fn(),
	}),
}));

import AccountPage from ".";

afterEach(cleanup);

describe("AccountPage", () => {
	it("uses semantic card subtext for account metadata", () => {
		render(<AccountPage />);

		const emails = screen.getAllByText("developer@example.com");
		expect(emails).toHaveLength(2);
		for (const email of emails) {
			expect(email).toHaveClass("card-subtext");
		}
		expect(screen.getByText("user-123")).toHaveClass("card-subtext");
		expect(screen.getAllByText("Not linked")[0]).toHaveClass("card-subtext");
	});
});
