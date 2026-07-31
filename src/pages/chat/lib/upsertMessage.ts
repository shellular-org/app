import type { AcpMessage } from "@shellular/protocol";

/**
 * Reconciliation of a streamed ACP message into the rendered transcript.
 *
 * One prompt turn produces several assistant messages (text → tool calls →
 * more text), each with its own agent-assigned id, and the CLI re-sends a
 * message on every chunk as it grows. The rules are:
 *
 *  - A message already present (matched by state key, else by requestId) is
 *    updated in place. This is the common case while a message streams.
 *  - An unrecognized user message reconciles with the optimistic local user
 *    bubble when one is outstanding, since the composer inserts one on send.
 *  - Every unrecognized assistant message appends. There is no optimistic
 *    assistant bubble to adopt, so nothing may overwrite an existing message.
 */

export interface UpsertContext {
	/** True while a prompt turn is in flight. */
	isStreaming: boolean;
	/** Id of the optimistic local user bubble, if outstanding. */
	localUserId: string | null;
	/** Id of the assistant message currently treated as the turn's tail. */
	localAssistantId: string | null;
	/** Timestamp the current turn was sent at; used to detect stale messages. */
	turnStartedAt: number;
}

export interface UpsertResult {
	messages: AcpMessage[];
	/** Updated tail-tracking id, or null to leave unchanged. */
	localAssistantId: string | null;
	localUserId: string | null;
}

/** Messages older than this much before the turn start are "stale". */
const STALE_MESSAGE_GRACE_MS = 250;

export function getMessageStateKey(message: AcpMessage): string | null {
	if (!message.id) return null;
	if (message.timestamp) {
		return `${message.id}:${message.role}:${message.timestamp}`;
	}
	return `${message.id}:${message.role}`;
}

export function upsertMessage(
	prev: AcpMessage[],
	incoming: AcpMessage,
	context: UpsertContext,
	mergeLocalUserText: (
		incoming: AcpMessage,
		existing: AcpMessage,
	) => AcpMessage,
): UpsertResult {
	const unchanged: Omit<UpsertResult, "messages"> = {
		localAssistantId: context.localAssistantId,
		localUserId: context.localUserId,
	};

	const incomingKey = getMessageStateKey(incoming);
	const byId = incomingKey
		? prev.findIndex((message) => getMessageStateKey(message) === incomingKey)
		: -1;

	if (byId >= 0) {
		const existing = prev[byId];
		const existingTs = existing.timestamp ?? 0;
		const localAssistantIndex = context.localAssistantId
			? prev.findIndex((message) => message.id === context.localAssistantId)
			: -1;

		// A message from an earlier turn collides by key with this turn's
		// output: relocate it to the tail so the live answer stays in order.
		// Only genuinely stale messages qualify — a differing index is normal
		// when one turn yields several assistant messages.
		const isStale =
			context.isStreaming &&
			incoming.role === "assistant" &&
			existing.role === "assistant" &&
			existingTs > 0 &&
			existingTs < context.turnStartedAt - STALE_MESSAGE_GRACE_MS;

		if (isStale) {
			if (localAssistantIndex >= 0 && localAssistantIndex !== byId) {
				return {
					messages: prev
						.filter((_, index) => index !== byId)
						.map((message) =>
							message.id === context.localAssistantId ? incoming : message,
						),
					...unchanged,
					localAssistantId: incoming.id ?? context.localAssistantId,
				};
			}
			return {
				messages: [...prev.filter((_, index) => index !== byId), incoming],
				...unchanged,
				localAssistantId: incoming.id ?? context.localAssistantId,
			};
		}

		const next = [...prev];
		next[byId] =
			incoming.role === "user"
				? mergeLocalUserText(incoming, existing)
				: incoming;
		return { messages: next, ...unchanged };
	}

	const byRequest =
		incoming.requestId === undefined
			? -1
			: prev.findIndex(
					(message) =>
						message.requestId === incoming.requestId &&
						message.role === incoming.role,
				);
	if (byRequest >= 0) {
		const next = [...prev];
		next[byRequest] =
			incoming.role === "user"
				? mergeLocalUserText(incoming, prev[byRequest])
				: incoming;
		return { messages: next, ...unchanged };
	}

	if (context.isStreaming && incoming.role === "user") {
		if (!context.localUserId) return { messages: prev, ...unchanged };
		const localUserIndex = prev.findIndex(
			(message) => message.id === context.localUserId,
		);
		if (localUserIndex >= 0) {
			const next = [...prev];
			next[localUserIndex] = {
				...mergeLocalUserText(incoming, prev[localUserIndex]),
				id: incoming.id || context.localUserId,
				requestId: incoming.requestId || context.localUserId,
			};
			return { messages: next, ...unchanged };
		}
		return { messages: prev, ...unchanged };
	}

	// An unrecognized assistant message always appends. The composer inserts no
	// optimistic assistant bubble — only a user one — so `localAssistantId` is
	// always a real server message (the turn's tail) or null. Replacing it here
	// would delete the message the agent had just finished, which is exactly
	// how a turn came to look like it was rewriting itself.
	return {
		messages: [...prev, incoming],
		...unchanged,
		localAssistantId:
			incoming.role === "assistant" && incoming.id
				? incoming.id
				: context.localAssistantId,
	};
}
