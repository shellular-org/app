import { describe, expect, it } from "vitest";
import {
	findImmediatelyClaimedPromptId,
	reconcilePromptQueueVisibility,
	shouldQueuePrompt,
} from "./promptQueue";

describe("shouldQueuePrompt", () => {
	it("sends directly when a stale queue runner has no remaining work", () => {
		expect(
			shouldQueuePrompt({
				sessionId: "session-one",
				sessionIsStreaming: false,
				queuedSessionIds: [],
			}),
		).toBe(false);
	});

	it("queues behind either an active turn or a pending item", () => {
		expect(
			shouldQueuePrompt({
				sessionId: "session-one",
				sessionIsStreaming: true,
				queuedSessionIds: [],
			}),
		).toBe(true);
		expect(
			shouldQueuePrompt({
				sessionId: "session-one",
				sessionIsStreaming: false,
				queuedSessionIds: ["session-one"],
			}),
		).toBe(true);
	});

	it("does not let another session's queue affect this chat", () => {
		expect(
			shouldQueuePrompt({
				sessionId: "session-one",
				sessionIsStreaming: false,
				queuedSessionIds: ["session-two"],
			}),
		).toBe(false);
	});
});

describe("reconcilePromptQueueVisibility", () => {
	it("hides the complete idle enqueue-to-running handoff", () => {
		const item = { id: "prompt-one", sessionId: "session-one" };
		const enqueued = reconcilePromptQueueVisibility(
			[item],
			false,
			{ sessionId: "session-one" },
			new Set(),
		);
		expect(enqueued.visibleItems).toEqual([]);
		expect(enqueued.directDispatch).toBeNull();
		expect(enqueued.immediatelyClaimedIds.has(item.id)).toBe(true);

		const claimed = reconcilePromptQueueVisibility(
			[item],
			true,
			enqueued.directDispatch,
			enqueued.immediatelyClaimedIds,
		);
		expect(claimed.visibleItems).toEqual([]);

		const drained = reconcilePromptQueueVisibility(
			[],
			true,
			claimed.directDispatch,
			claimed.immediatelyClaimedIds,
		);
		expect(drained.immediatelyClaimedIds.size).toBe(0);
	});

	it("keeps genuinely queued work visible", () => {
		const item = { id: "prompt-two", sessionId: "session-one" };
		const result = reconcilePromptQueueVisibility(
			[item],
			true,
			null,
			new Set(),
		);
		expect(result.visibleItems).toEqual([item]);
	});
});

describe("findImmediatelyClaimedPromptId", () => {
	const item = {
		id: "prompt-one",
		sessionId: "session-one",
	};

	it("recognizes an idle queue's direct prompt as execution handoff", () => {
		expect(
			findImmediatelyClaimedPromptId([item], false, {
				sessionId: "session-one",
			}),
		).toBe("prompt-one");
	});

	it("does not hide prompts that are actually waiting", () => {
		expect(
			findImmediatelyClaimedPromptId([item], true, {
				sessionId: "session-one",
			}),
		).toBeUndefined();
		expect(
			findImmediatelyClaimedPromptId([item], false, {
				sessionId: "session-two",
			}),
		).toBeUndefined();
	});

	it("does not hide a prompt when other work was already queued", () => {
		expect(
			findImmediatelyClaimedPromptId(
				[item, { ...item, id: "prompt-two" }],
				false,
				{
					sessionId: "session-one",
				},
			),
		).toBeUndefined();
	});
});
