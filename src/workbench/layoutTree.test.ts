import { describe, expect, it } from "vitest";
import {
	collectWorkbenchGroupIds,
	collectWorkbenchSurfaceIds,
	createWorkbenchGroup,
	findParentWorkbenchSplit,
	findWorkbenchGroup,
	findWorkbenchTab,
	moveWorkbenchTab,
	normalizeWorkbenchTree,
	removeWorkbenchNode,
	resizeWorkbenchSplit,
	setWorkbenchTabPinned,
	splitWorkbenchGroupWithTab,
	validateWorkbenchTree,
	workbenchMinimumSize,
} from "./layoutTree";
import type { WorkbenchLayoutNode, WorkbenchTabRef } from "./types";

const refs = (...ids: string[]): WorkbenchTabRef[] =>
	ids.map((surfaceId) => ({ surfaceId, pinned: false }));

describe("workbench layout tree", () => {
	it("moves and reorders tabs without duplicating surfaces", () => {
		const root: WorkbenchLayoutNode = {
			type: "split",
			id: "split:root",
			orientation: "horizontal",
			ratio: 0.5,
			first: createWorkbenchGroup("group:a", refs("a", "b"), "a"),
			second: createWorkbenchGroup("group:b", refs("c"), "c"),
		};

		const moved = moveWorkbenchTab(root, "b", "group:b", 0);
		expect(findWorkbenchGroup(moved, "group:a")?.tabs).toEqual(refs("a"));
		expect(findWorkbenchGroup(moved, "group:b")?.tabs).toEqual(refs("b", "c"));
		expect(collectWorkbenchSurfaceIds(moved)).toEqual(["a", "b", "c"]);

		const reordered = moveWorkbenchTab(moved, "c", "group:b", 0);
		expect(findWorkbenchGroup(reordered, "group:b")?.tabs).toEqual(
			refs("c", "b"),
		);
	});

	it("keeps pinned tabs as an explicit prefix", () => {
		let root: WorkbenchLayoutNode = createWorkbenchGroup(
			"group:a",
			refs("a", "b", "c"),
			"a",
		);
		root = setWorkbenchTabPinned(root, "b", true);
		expect(findWorkbenchGroup(root, "group:a")?.tabs).toEqual([
			{ surfaceId: "b", pinned: true },
			{ surfaceId: "a", pinned: false },
			{ surfaceId: "c", pinned: false },
		]);
		root = moveWorkbenchTab(root, "c", "group:a", 0);
		expect(
			findWorkbenchGroup(root, "group:a")?.tabs.map((tab) => tab.surfaceId),
		).toEqual(["b", "c", "a"]);
	});

	it("creates nested directional splits and rejects a sole self split", () => {
		const original = createWorkbenchGroup("group:a", refs("a", "b"), "a");
		const horizontal = splitWorkbenchGroupWithTab(
			original,
			"b",
			"group:a",
			"right",
			{ splitId: "split:one", groupId: "group:b" },
		);
		expect(horizontal.type).toBe("split");
		expect(findWorkbenchGroup(horizontal, "group:b")?.tabs).toEqual(refs("b"));

		const nested = splitWorkbenchGroupWithTab(
			horizontal,
			"a",
			"group:b",
			"down",
			{ splitId: "split:two", groupId: "group:c" },
		);
		expect(findParentWorkbenchSplit(nested, "group:c")?.id).toBe("split:two");
		expect(collectWorkbenchGroupIds(nested)).toEqual(["group:b", "group:c"]);
		expect(
			splitWorkbenchGroupWithTab(
				createWorkbenchGroup("only", refs("a")),
				"a",
				"only",
				"left",
			),
		).toEqual(createWorkbenchGroup("only", refs("a")));

		const left = splitWorkbenchGroupWithTab(
			createWorkbenchGroup("left-source", refs("a", "b")),
			"b",
			"left-source",
			"left",
			{ groupId: "left-pane", splitId: "left-split" },
		);
		expect(collectWorkbenchSurfaceIds(left)).toEqual(["b", "a"]);
		const up = splitWorkbenchGroupWithTab(
			createWorkbenchGroup("up-source", refs("a", "b")),
			"b",
			"up-source",
			"up",
			{ groupId: "up-pane", splitId: "up-split" },
		);
		expect(collectWorkbenchSurfaceIds(up)).toEqual(["b", "a"]);
	});

	it("collapses an empty source pane and promotes siblings", () => {
		const root: WorkbenchLayoutNode = {
			type: "split",
			id: "split:root",
			orientation: "horizontal",
			ratio: 0.5,
			first: createWorkbenchGroup("group:a", refs("a")),
			second: createWorkbenchGroup("group:b", refs("b")),
		};
		const moved = moveWorkbenchTab(root, "a", "group:b");
		expect(moved.type).toBe("group");
		expect(collectWorkbenchSurfaceIds(moved)).toEqual(["b", "a"]);
		expect(removeWorkbenchNode(root, "group:a")?.id).toBe("group:b");
	});

	it("normalizes corrupt trees, duplicates, order, and ratios", () => {
		const corrupt: WorkbenchLayoutNode = {
			type: "split",
			id: "split:root",
			orientation: "horizontal",
			ratio: 9,
			first: createWorkbenchGroup("group:a", [
				{ surfaceId: "a", pinned: false },
				{ surfaceId: "missing", pinned: false },
			]),
			second: createWorkbenchGroup("group:b", [
				{ surfaceId: "a", pinned: false },
				{ surfaceId: "b", pinned: true },
			]),
		};
		const normalized = normalizeWorkbenchTree(corrupt, new Set(["a", "b"]));
		expect(collectWorkbenchSurfaceIds(normalized)).toEqual(["a", "b"]);
		expect(normalized.type).toBe("split");
		if (normalized.type === "split") expect(normalized.ratio).toBe(0.9);
		expect(findWorkbenchTab(normalized, "b")?.tab.pinned).toBe(true);
	});

	it("calculates recursive minimum sizes and clamps resize ratios", () => {
		const root: WorkbenchLayoutNode = {
			type: "split",
			id: "split:root",
			orientation: "vertical",
			ratio: 0.5,
			first: createWorkbenchGroup("group:a"),
			second: createWorkbenchGroup("group:b"),
		};
		expect(workbenchMinimumSize(root)).toEqual({ width: 240, height: 324 });
		const resized = resizeWorkbenchSplit(root, "split:root", 0.01);
		expect(resized.type === "split" && resized.ratio).toBe(0.1);
	});

	it("reports invariant violations without mutating the tree", () => {
		const invalid: WorkbenchLayoutNode = {
			type: "split",
			id: "duplicate",
			orientation: "horizontal",
			ratio: 2,
			first: createWorkbenchGroup(
				"duplicate",
				[
					{ surfaceId: "a", pinned: false },
					{ surfaceId: "b", pinned: true },
				],
				"missing",
			),
			second: createWorkbenchGroup("other", refs("a")),
		};
		const result = validateWorkbenchTree(invalid, new Set(["a"]));
		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"Duplicate node ID: duplicate",
				"Invalid split ratio: duplicate",
				"Pinned tab is outside prefix: b",
				"Unknown surface: b",
				"Invalid active tab: duplicate",
				"Duplicate surface: a",
			]),
		);
	});
});
