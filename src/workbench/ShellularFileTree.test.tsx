import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ShellularFileTree, {
	getShellularFileTreeCacheStats,
	resetShellularFileTreeCache,
	type ShellularFileTreeModel,
} from "./ShellularFileTree";

afterEach(() => {
	cleanup();
	resetShellularFileTreeCache();
});

describe("ShellularFileTree", () => {
	it("encapsulates the Trees model and maps the app theme", async () => {
		const model = { current: null as ShellularFileTreeModel | null };
		const view = render(
			<div style={{ height: 300 }}>
				<ShellularFileTree
					ariaLabel="Project files"
					cacheKey="project:test:/work"
					revision={1}
					entries={[
						{ path: "src", type: "directory" },
						{ path: "src/main.ts", type: "file", gitStatus: "modified" },
					]}
					onActivate={vi.fn()}
					onModel={(next) => {
						model.current = next;
					}}
				/>
			</div>,
		);

		const tree = view.container.querySelector("file-tree-container");
		expect(tree).not.toBeNull();
		expect(tree).toHaveAttribute("aria-label", "Project files");
		expect(
			(tree as HTMLElement).style.getPropertyValue("--trees-bg-override"),
		).toBe("var(--workbench-sidebar-background, var(--primary))");
		expect(
			(tree as HTMLElement).style.getPropertyValue("--trees-item-height"),
		).toBe("28px");
		expect(
			(tree as HTMLElement).style.getPropertyValue(
				"--trees-git-modified-color-override",
			),
		).toBe("var(--warning)");
		expect(tree).toHaveClass("bg-transparent");
		expect(
			tree?.shadowRoot?.querySelector('[data-file-tree-colored-icons="true"]'),
		).toBeNull();
		const unsafeStyle = tree?.shadowRoot?.querySelector(
			"style[data-file-tree-unsafe-css]",
		);
		expect(unsafeStyle).toHaveTextContent(
			'[data-item-git-status] > [data-item-section="content"]',
		);
		expect(unsafeStyle).toHaveTextContent(
			'[data-item-section="icon"] > :where(:not([data-icon-name="file-tree-icon-chevron"]))',
		);
		expect(unsafeStyle).toHaveTextContent("color: var(--trees-fg)");
		expect(unsafeStyle).toHaveTextContent("color: var(--trees-fg-muted)");
		await waitFor(() => expect(model.current).not.toBeNull());

		expect(() => {
			act(() => {
				model.current?.add("src/new.ts", "file");
				model.current?.move("src/new.ts", "src/renamed.ts", "file");
				model.current?.remove("src/renamed.ts", "file");
			});
		}).not.toThrow();

		const search = tree?.shadowRoot?.querySelector(
			"[data-file-tree-search-container]",
		);
		expect(search).toHaveAttribute("data-open", "false");
		act(() => model.current?.openSearch());
		await waitFor(() => expect(search).toHaveAttribute("data-open", "true"));
		act(() => model.current?.closeSearch());
		await waitFor(() => expect(search).toHaveAttribute("data-open", "false"));
	});

	it("reuses a cached model and its mutations across remounts", async () => {
		let model: ShellularFileTreeModel | null = null;
		const renderTree = () =>
			render(
				<div style={{ height: 300 }}>
					<ShellularFileTree
						ariaLabel="Cached files"
						cacheKey="project:test:/cached"
						revision={2}
						initialExpansion="open"
						entries={[
							{ path: "src", type: "directory" },
							{ path: "src/main.ts", type: "file" },
							{ path: "src/new.ts", type: "file" },
						]}
						onActivate={vi.fn()}
						onModel={(next) => {
							model = next;
						}}
					/>
				</div>,
			);

		const first = renderTree();
		await waitFor(() => expect(model).not.toBeNull());
		expect(
			getShellularFileTreeCacheStats("project:test:/cached")?.resetCount,
		).toBe(1);
		act(() => model?.remove("src/new.ts", "file", 3));
		first.unmount();

		const second = render(
			<div style={{ height: 300 }}>
				<ShellularFileTree
					ariaLabel="Cached files"
					cacheKey="project:test:/cached"
					revision={3}
					initialExpansion="open"
					entries={[
						{ path: "src", type: "directory" },
						{ path: "src/main.ts", type: "file" },
					]}
					onActivate={vi.fn()}
				/>
			</div>,
		);
		const tree = second.container.querySelector("file-tree-container");
		await waitFor(() =>
			expect(
				tree?.shadowRoot?.querySelector('[data-item-path="src/new.ts"]'),
			).toBeNull(),
		);
		expect(
			getShellularFileTreeCacheStats("project:test:/cached"),
		).toMatchObject({ revision: 3, resetCount: 1 });
	});

	it("searches nested pnpm paths without duplicating directory segments", async () => {
		const model = { current: null as ShellularFileTreeModel | null };
		const base =
			"node_modules/.pnpm/@peculiar+asn1-schema@2.6.0/node_modules/@peculiar/asn1-schema/build/types/errors";
		render(
			<div style={{ height: 300 }}>
				<ShellularFileTree
					ariaLabel="pnpm files"
					cacheKey="project:test:/pnpm"
					revision={1}
					entries={[
						{ path: "node_modules", type: "directory" },
						{ path: "node_modules/.pnpm", type: "directory" },
						{
							path: "node_modules/.pnpm/@peculiar+asn1-schema@2.6.0",
							type: "directory",
						},
						{
							path: "node_modules/.pnpm/@peculiar+asn1-schema@2.6.0/node_modules",
							type: "directory",
						},
						{
							path: "node_modules/.pnpm/@peculiar+asn1-schema@2.6.0/node_modules/@peculiar",
							type: "directory",
						},
						{
							path: "node_modules/.pnpm/@peculiar+asn1-schema@2.6.0/node_modules/@peculiar/asn1-schema",
							type: "directory",
						},
						{
							path: "node_modules/.pnpm/@peculiar+asn1-schema@2.6.0/node_modules/@peculiar/asn1-schema/build",
							type: "directory",
						},
						{
							path: "node_modules/.pnpm/@peculiar+asn1-schema@2.6.0/node_modules/@peculiar/asn1-schema/build/types",
							type: "directory",
						},
						{ path: base, type: "directory" },
						{ path: `${base}/index.d.ts`, type: "file" },
					]}
					onActivate={vi.fn()}
					onModel={(next) => {
						model.current = next;
					}}
				/>
			</div>,
		);

		await waitFor(() => expect(model.current).not.toBeNull());
		act(() => model.current?.openSearch("errors"));
		expect(model.current?.getSearchMatchingPaths()).toEqual([
			base,
			`${base}/index.d.ts`,
		]);
		expect(model.current?.getSearchMatchingPaths()[0]).not.toContain(
			"node_modules/node_modules",
		);
	});

	it("contains invalid tree input and offers recovery", async () => {
		const retry = vi.fn();
		const view = render(
			<ShellularFileTree
				ariaLabel="Invalid files"
				cacheKey="project:test:/invalid"
				revision={1}
				entries={[{ path: "../outside", type: "file" }]}
				onActivate={vi.fn()}
				onRetry={retry}
			/>,
		);

		const alert = await waitFor(() => view.getByRole("alert"));
		expect(alert).toHaveTextContent("Invalid relative tree path");
		view.getByRole("button", { name: "Refresh tree" }).click();
		expect(retry).toHaveBeenCalledOnce();
	});
});
