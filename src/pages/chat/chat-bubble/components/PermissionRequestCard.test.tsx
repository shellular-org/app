import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PermissionRequestCard from "./PermissionRequestCard";

afterEach(cleanup);

const LONG_COMMAND =
	"php artisan migrate --path=database/migrations/2026_08_19_tax_basis.php --force --no-interaction";

function permission(overrides: Record<string, unknown> = {}) {
	return {
		id: "p1",
		sessionId: "s1",
		kind: "execute",
		title: LONG_COMMAND,
		options: [{ optionId: "allow", name: "Allow once", kind: "allow_once" }],
		...overrides,
	} as never;
}

describe("PermissionRequestCard", () => {
	it("shows the whole command it is asking about, never shortened", () => {
		// Truncating a string that a tap will execute is a safety defect, not a
		// layout choice.
		render(
			<PermissionRequestCard permission={permission()} onReply={() => {}} />,
		);
		const node = screen.getByText(LONG_COMMAND);
		expect(node.textContent).toBe(LONG_COMMAND);
		expect(node.textContent).not.toContain("…");
	});

	it("shows the command exactly once when it is also the heading", () => {
		render(
			<PermissionRequestCard permission={permission()} onReply={() => {}} />,
		);
		expect(screen.getAllByText(LONG_COMMAND)).toHaveLength(1);
	});

	it("keeps the reason as the heading and the command underneath it", () => {
		render(
			<PermissionRequestCard
				permission={permission({
					metadata: {
						toolCall: { rawInput: { reason: "Backfill the tax basis" } },
					},
				})}
				onReply={() => {}}
			/>,
		);
		expect(screen.getByText("Backfill the tax basis")).toBeInTheDocument();
		expect(screen.getByText(LONG_COMMAND)).toBeInTheDocument();
	});

	it("still offers every reply option", () => {
		render(
			<PermissionRequestCard permission={permission()} onReply={() => {}} />,
		);
		expect(
			screen.getByRole("button", { name: "Allow once" }),
		).toBeInTheDocument();
	});
});
