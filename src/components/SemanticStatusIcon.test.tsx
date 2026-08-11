import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SemanticStatusIcon from "./SemanticStatusIcon";

afterEach(cleanup);

describe("SemanticStatusIcon", () => {
	it("uses consistent dimensions, semantic color, and an accessible label", () => {
		render(
			<SemanticStatusIcon
				icon="icon-check-circle"
				label="Finished"
				tone="success"
			/>,
		);

		const status = screen.getByRole("img", { name: "Finished" });
		expect(status).toHaveClass("size-4", "text-success");
		expect(status).toHaveAttribute("title", "Finished");
		expect(status.firstElementChild).toHaveClass(
			"icon-check-circle",
			"text-[14px]",
		);
	});

	it("uses the shared motion-safe animation treatment", () => {
		render(
			<SemanticStatusIcon
				icon="icon-loader"
				label="Working"
				tone="info"
				animated
			/>,
		);

		expect(
			screen.getByRole("img", { name: "Working" }).firstElementChild,
		).toHaveClass("animate-spin", "motion-reduce:animate-none");
	});
});
