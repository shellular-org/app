import { describe, expect, it } from "vitest";
import { createWorkbenchGroup } from "./layoutTree";
import type { WorkbenchSnapshot } from "./types";
import {
	adjacentPaneId,
	adjacentPaneMoveTarget,
	adjacentTabId,
	numberedPaneId,
	reorderedTabTarget,
	rightTabIds,
} from "./workbenchNavigation";

const snapshot: WorkbenchSnapshot = {
	surfaces: [],
	root: {
		type: "split",
		id: "root",
		orientation: "horizontal",
		ratio: 0.5,
		first: createWorkbenchGroup(
			"left",
			[
				{ surfaceId: "a", pinned: false },
				{ surfaceId: "b", pinned: false },
				{ surfaceId: "c", pinned: false },
			],
			"b",
		),
		second: {
			type: "split",
			id: "right",
			orientation: "vertical",
			ratio: 0.5,
			first: createWorkbenchGroup(
				"top",
				[{ surfaceId: "d", pinned: false }],
				"d",
			),
			second: createWorkbenchGroup(
				"bottom",
				[{ surfaceId: "e", pinned: false }],
				"e",
			),
		},
	},
	focusedGroupId: "left",
	activeId: "b",
	hostId: "host",
	dialog: null,
};

describe("workbench keyboard navigation", () => {
	it("cycles and reorders tabs within the focused pane", () => {
		expect(adjacentTabId(snapshot, 1)).toBe("c");
		expect(adjacentTabId(snapshot, -1)).toBe("a");
		expect(reorderedTabTarget(snapshot, 1)).toEqual({
			surfaceId: "b",
			groupId: "left",
			index: 2,
		});
		expect(rightTabIds(snapshot)).toEqual(["c"]);
	});

	it("numbers panes in layout order and finds directional neighbors", () => {
		expect(numberedPaneId(snapshot.root, 1)).toBe("left");
		expect(numberedPaneId(snapshot.root, 3)).toBe("bottom");
		expect(adjacentPaneId(snapshot.root, "left", "right")).toBe("top");
		expect(adjacentPaneId(snapshot.root, "top", "down")).toBe("bottom");
		expect(adjacentPaneId(snapshot.root, "left", "left")).toBeNull();
	});

	it("wraps active-tab movement across panes", () => {
		expect(adjacentPaneMoveTarget(snapshot, -1)).toEqual({
			surfaceId: "b",
			groupId: "bottom",
		});
		expect(adjacentPaneMoveTarget(snapshot, 1)).toEqual({
			surfaceId: "b",
			groupId: "top",
		});
	});
});
