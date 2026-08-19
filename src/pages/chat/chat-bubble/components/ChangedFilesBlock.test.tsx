import type { AcpMessagePart } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import { collectFileChanges } from "./ChangedFilesBlock";

function change(path: string, old: string, next: string): AcpMessagePart {
	return {
		type: "file_change",
		path,
		kind: "edit",
		diff: { old, new: next },
	} as AcpMessagePart;
}

describe("collectFileChanges", () => {
	it("counts added and removed lines from the diff", () => {
		const [entry] = collectFileChanges([
			change("a.php", "one\ntwo", "one\ntwo\nthree"),
		]);
		expect(entry).toEqual({
			path: "a.php",
			added: 1,
			removed: 0,
			isNew: false,
		});
	});

	it("marks a file with no old side as new", () => {
		const [entry] = collectFileChanges([change("b.php", "", "one\ntwo")]);
		expect(entry.isNew).toBe(true);
		expect(entry.added).toBe(2);
	});

	it("counts a removal", () => {
		const [entry] = collectFileChanges([
			change("c.php", "one\ntwo\nthree", "one"),
		]);
		expect(entry).toEqual({
			path: "c.php",
			added: 0,
			removed: 2,
			isNew: false,
		});
	});

	it("keeps the last state when the same file changes twice", () => {
		const entries = collectFileChanges([
			change("a.php", "one", "one\ntwo"),
			change("a.php", "one", "one\ntwo\nthree"),
		]);
		expect(entries).toHaveLength(1);
		expect(entries[0].added).toBe(2);
	});

	it("ignores parts without a diff", () => {
		expect(
			collectFileChanges([
				{ type: "file_change", path: "c.php", kind: "edit" } as AcpMessagePart,
			]),
		).toEqual([]);
	});

	it("ignores everything that is not a file change", () => {
		expect(collectFileChanges([{ type: "text", text: "hello" }])).toEqual([]);
	});
});
