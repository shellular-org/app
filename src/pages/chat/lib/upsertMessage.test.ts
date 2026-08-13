import type { AcpMessage } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import { type UpsertContext, upsertMessage } from "./upsertMessage";

function message(
	id: string,
	role: "user" | "assistant",
	text: string,
	timestamp?: number,
): AcpMessage {
	return {
		id,
		role,
		parts: [{ type: "text", text }],
		...(timestamp ? { timestamp } : {}),
	} as AcpMessage;
}

const mergeLocalUserText = (incoming: AcpMessage) => incoming;

function streamingContext(overrides: Partial<UpsertContext> = {}) {
	return {
		isStreaming: true,
		localUserId: "user_local_1000",
		localAssistantId: null,
		turnStartedAt: 1000,
		...overrides,
	} satisfies UpsertContext;
}

function texts(messages: AcpMessage[]) {
	return messages.map(
		(item) => (item.parts[0] as { text?: string } | undefined)?.text ?? "",
	);
}

describe("upsertMessage", () => {
	it("appends the turn's first assistant message after the user bubble", () => {
		// The composer inserts only a user bubble on send, so `localAssistantId`
		// starts null and the first server message appends.
		const prev = [message("user_local_1000", "user", "hi")];
		const result = upsertMessage(
			prev,
			message("srv_a", "assistant", "A"),
			streamingContext(),
			mergeLocalUserText,
		);
		expect(texts(result.messages)).toEqual(["hi", "A"]);
		expect(result.localAssistantId).toBe("srv_a");
	});

	it("appends later messages of the same turn instead of overwriting", () => {
		// The reported bug, reproduced against the CLI's real event stream: one
		// turn emits several assistant messages (A → tools → B → C) and each new
		// one replaced the previous, because `localAssistantId` tracks the tail
		// (a real message) and was being treated as an adoptable placeholder.
		let messages = [message("user_local_1000", "user", "hi")];
		let context = streamingContext();

		for (const [id, text] of [
			["srv_a", "A"],
			["srv_b", "B"],
			["srv_c", "C"],
		]) {
			const result = upsertMessage(
				messages,
				message(id, "assistant", text),
				context,
				mergeLocalUserText,
			);
			messages = result.messages;
			context = { ...context, localAssistantId: result.localAssistantId };
		}

		expect(texts(messages)).toEqual(["hi", "A", "B", "C"]);
	});

	it("keeps every message when a turn interleaves text and tool calls", () => {
		// Mirrors the CLI stream exactly: each message is re-sent as it grows,
		// so repeated events for an earlier message must not resurrect or
		// relocate it once later messages exist.
		let messages: AcpMessage[] = [message("user_local_1000", "user", "hi")];
		let context = streamingContext();
		const apply = (incoming: AcpMessage) => {
			const result = upsertMessage(
				messages,
				incoming,
				context,
				mergeLocalUserText,
			);
			messages = result.messages;
			context = { ...context, localAssistantId: result.localAssistantId };
		};

		apply(message("srv_a", "assistant", "A", 1001));
		apply(message("srv_a", "assistant", "A grown", 1001));
		apply(message("srv_b", "assistant", "B", 1001));
		apply(message("srv_c", "assistant", "C", 1001));

		expect(texts(messages)).toEqual(["hi", "A grown", "B", "C"]);
		expect(messages).toHaveLength(4);
	});

	it("updates a streaming message in place as it grows", () => {
		let messages = [message("srv_a", "assistant", "Par")];
		const context = streamingContext({
			localAssistantId: "srv_a",
		});
		messages = upsertMessage(
			messages,
			message("srv_a", "assistant", "Partial answer"),
			context,
			mergeLocalUserText,
		).messages;
		expect(texts(messages)).toEqual(["Partial answer"]);
		expect(messages).toHaveLength(1);
	});

	it("relocates a stale message from an earlier turn to the tail", () => {
		const prev = [
			message("srv_old", "assistant", "old", 100),
			message("user_local_2000", "user", "hi"),
		];
		const result = upsertMessage(
			prev,
			message("srv_old", "assistant", "old revisited", 100),
			streamingContext({ turnStartedAt: 2000, localAssistantId: null }),
			mergeLocalUserText,
		);
		expect(texts(result.messages)).toEqual(["hi", "old revisited"]);
	});

	it("does not relocate messages belonging to the current turn", () => {
		const prev = [
			message("srv_a", "assistant", "A", 2100),
			message("srv_b", "assistant", "B", 2200),
		];
		const result = upsertMessage(
			prev,
			message("srv_a", "assistant", "A updated", 2100),
			streamingContext({
				turnStartedAt: 2000,
				localAssistantId: "srv_b",
			}),
			mergeLocalUserText,
		);
		expect(texts(result.messages)).toEqual(["A updated", "B"]);
	});

	it("reconciles the optimistic user bubble with the server's copy", () => {
		const prev = [message("user_local_1000", "user", "hi")];
		const result = upsertMessage(
			prev,
			message("srv_user", "user", "hi"),
			streamingContext(),
			mergeLocalUserText,
		);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].id).toBe("srv_user");
	});

	it("reconciles before streaming state propagation catches up", () => {
		const prev = [message("user_local_1000", "user", "hi")];
		const result = upsertMessage(
			prev,
			message("srv_user", "user", "hi"),
			streamingContext({ isStreaming: false }),
			mergeLocalUserText,
		);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].id).toBe("srv_user");
	});

	it("appends when not streaming", () => {
		const prev = [message("srv_a", "assistant", "A")];
		const result = upsertMessage(
			prev,
			message("srv_b", "assistant", "B"),
			streamingContext({ isStreaming: false }),
			mergeLocalUserText,
		);
		expect(texts(result.messages)).toEqual(["A", "B"]);
	});

	it("appends rather than overwriting when rejoining a live turn", () => {
		// On reattach `localAssistantId` is seeded from the restored transcript's
		// last assistant message, so it points at a real message. The next
		// incoming message must append instead of replacing it.
		const prev = [
			message("srv_a", "assistant", "A"),
			message("srv_b", "assistant", "B"),
		];
		const result = upsertMessage(
			prev,
			message("srv_c", "assistant", "C"),
			streamingContext({
				localAssistantId: "srv_b",
			}),
			mergeLocalUserText,
		);
		expect(texts(result.messages)).toEqual(["A", "B", "C"]);
	});
});
