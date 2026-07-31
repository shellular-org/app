import type { AcpMessage } from "@shellular/protocol";

/**
 * Reconciliation of streaming `token` deltas against authoritative `message`
 * events.
 *
 * The CLI emits both for the same text: a `token` per chunk (cheap, immediate)
 * and a full `message` carrying the message's CUMULATIVE text. Message events
 * are coalesced (~150ms) while tokens are not, so between two message events
 * several tokens arrive whose text the last message event already included.
 *
 * Appending each token blindly double-renders it until the next message event
 * overwrites the message — visible as text that duplicates and then snaps back.
 * Instead, tokens are accumulated per message and rendered as the suffix beyond
 * what the last message event delivered, which is idempotent no matter how the
 * two streams interleave.
 */

/** Concatenated text of a message's trailing text parts. */
export function messageText(message: AcpMessage): string {
	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => ("text" in part ? (part.text ?? "") : ""))
		.join("");
}

/**
 * Text to append to `message` for a token stream that has accumulated
 * `streamedText` in total. Returns "" when the message already contains it,
 * which is the common case right after a message event lands.
 */
export function pendingTokenSuffix(
	message: AcpMessage,
	streamedText: string,
): string {
	const current = messageText(message);
	// The authoritative text is ahead of (or level with) the token stream.
	if (current.length >= streamedText.length) return "";
	// Tokens must extend what is already rendered; if they diverge (a rewrite,
	// a replayed transcript) the message event is authoritative — render
	// nothing and let the next one settle it.
	if (!streamedText.startsWith(current)) return "";
	return streamedText.slice(current.length);
}

/** Append `text` to the message's trailing text part, or start a new one. */
export function appendTextPart(
	message: AcpMessage,
	text: string,
): AcpMessage["parts"] {
	const parts = [...message.parts];
	const last = parts[parts.length - 1];
	if (
		last &&
		last.type === "text" &&
		typeof (last as { text?: unknown }).text === "string"
	) {
		parts[parts.length - 1] = {
			...last,
			text: `${(last as { text: string }).text}${text}`,
		};
		return parts;
	}
	parts.push({ type: "text", text } as AcpMessage["parts"][number]);
	return parts;
}
