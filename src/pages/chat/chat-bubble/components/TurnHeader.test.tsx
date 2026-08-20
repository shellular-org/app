import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TurnHeader from "./TurnHeader";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("TurnHeader", () => {
	it("names the agent and its state", () => {
		render(<TurnHeader assistantName="Claude Code" state="working" />);
		expect(screen.getByText("Claude Code is working")).toBeInTheDocument();
	});

	it("distinguishes a permission from a question", () => {
		const { rerender } = render(
			<TurnHeader assistantName="Claude Code" state="waiting-permission" />,
		);
		expect(
			screen.getByText("Claude Code is waiting for permission"),
		).toBeInTheDocument();
		rerender(<TurnHeader assistantName="Claude Code" state="waiting-answer" />);
		expect(
			screen.getByText("Claude Code is waiting for your answer"),
		).toBeInTheDocument();
	});

	it("names a failure without naming the agent", () => {
		render(<TurnHeader assistantName="Claude Code" state="failed" />);
		expect(screen.getByText("A command failed")).toBeInTheDocument();
	});

	it("renders the commentary line when there is one", () => {
		render(
			<TurnHeader
				assistantName="Claude Code"
				state="working"
				commentary="The backfill already ran in production."
			/>,
		);
		expect(
			screen.getByText("The backfill already ran in production."),
		).toBeInTheDocument();
	});

	it("omits the commentary line when there is none", () => {
		const { container } = render(
			<TurnHeader assistantName="Claude Code" state="working" />,
		);
		expect(container.querySelector(".turn-header-commentary")).toBeNull();
	});

	it("marks the timer as a timer, which is silent to assistive technology", () => {
		// WAI-ARIA: role="timer" defaults to aria-live="off" while its siblings
		// status and log default to polite. That default is the whole point.
		const { container } = render(
			<TurnHeader assistantName="Claude Code" state="working" />,
		);
		const timer = container.querySelector('[role="timer"]');
		expect(timer).not.toBeNull();
		expect(timer).toHaveAttribute("aria-live", "off");
	});

	it("marks the state word as a status region", () => {
		const { container } = render(
			<TurnHeader assistantName="Claude Code" state="working" />,
		);
		expect(container.querySelector('[role="status"]')).not.toBeNull();
	});

	it("stops ticking per second when the user asked for reduced motion", () => {
		// WCAG SC 2.2.2 (Level A) covers auto-updating content and has no
		// five-second exception. Honouring the existing reduced-motion signal is
		// the "control the frequency of the update" branch of the criterion.
		const matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: query.includes("prefers-reduced-motion"),
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}));
		vi.stubGlobal("matchMedia", matchMedia);
		const setInterval = vi.spyOn(window, "setInterval");
		render(
			<TurnHeader
				assistantName="Claude Code"
				state="working"
				startedAt={Date.now()}
			/>,
		);
		// A once-a-minute refresh, not a once-a-second tick.
		expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
	});

	it("ticks once a second when reduced motion was not asked for", () => {
		vi.stubGlobal(
			"matchMedia",
			vi.fn().mockImplementation((query: string) => ({
				matches: false,
				media: query,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		);
		const setInterval = vi.spyOn(window, "setInterval");
		render(
			<TurnHeader
				assistantName="Claude Code"
				state="working"
				startedAt={Date.now() - 72_000}
			/>,
		);
		expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1_000);
		expect(screen.getByRole("timer").textContent).toBe("1m 12s");
	});
});
