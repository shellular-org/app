import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	ShellularFileIcon,
	ShellularFileIconSprite,
} from "./ShellularFileIcon";

afterEach(cleanup);

describe("ShellularFileIcon", () => {
	it("uses the same public Trees resolver and sprite for standalone icons", () => {
		const view = render(
			<div>
				<ShellularFileIconSprite />
				<ShellularFileIcon path="src/app.ts" />
				<ShellularFileIcon path="README.md" />
				<ShellularFileIcon path="unknown.shellular" />
			</div>,
		);

		expect(
			view.container.querySelector("#file-tree-builtin-typescript"),
		).not.toBeNull();
		expect(
			view.container.querySelector('[data-icon-token="typescript"] use'),
		).toHaveAttribute("href", "#file-tree-builtin-typescript");
		expect(
			view.container.querySelector('[data-icon-token="markdown"]'),
		).not.toBeNull();
		expect(
			view.container.querySelector('[data-icon-token="default"]'),
		).not.toBeNull();
		expect(
			view.container.querySelector('[data-icon-token="typescript"]'),
		).toHaveStyle({
			color: "var(--trees-icon-blue, var(--secondary-text))",
		});
	});

	it("allows dense tree and Git rows to request a neutral icon", () => {
		const view = render(
			<ShellularFileIcon path="src/app.ts" color="var(--secondary-text)" />,
		);
		expect(view.container.querySelector("svg")).toHaveStyle({
			color: "var(--secondary-text)",
		});
	});
});
