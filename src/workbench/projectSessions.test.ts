import { describe, expect, it } from "vitest";
import { mergeProjectSessions, toProjectSession } from "./projectSessions";

describe("project session aggregation", () => {
	it("preserves identical session ids from different agents", () => {
		const sessions = mergeProjectSessions(
			[],
			[
				toProjectSession(
					"codex",
					{ id: "same", title: "Codex", createdAt: 1, updatedAt: 2 },
					"/repo",
				),
				toProjectSession(
					"claude-code",
					{ id: "same", title: "Claude", createdAt: 1, updatedAt: 3 },
					"/repo",
				),
			],
			[],
			"/repo",
		);

		expect(sessions.map((session) => session.key)).toEqual([
			"claude-code:same",
			"codex:same",
		]);
	});

	it("merges local drafts and sorts everything by recent activity", () => {
		const sessions = mergeProjectSessions(
			[],
			[
				toProjectSession(
					"codex",
					{ id: "saved", title: "Saved", createdAt: 1, updatedAt: 10 },
					"/repo",
				),
			],
			[
				{
					id: "draft-1",
					agentId: "claude-code",
					sessionId: "",
					title: "New Chat",
					createdAt: 20,
					updatedAt: 20,
				},
			],
			"/repo",
		);

		expect(sessions.map((session) => session.title)).toEqual([
			"New Chat",
			"Saved",
		]);
		expect(sessions[0].draft).toBe(true);
	});
});
