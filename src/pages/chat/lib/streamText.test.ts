import type { AcpMessage } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import { appendTextPart, messageText, pendingTokenSuffix } from "./streamText";

function assistant(...texts: string[]): AcpMessage {
	return {
		id: "m1",
		role: "assistant",
		parts: texts.map((text) => ({ type: "text", text })),
	} as AcpMessage;
}

function withTool(text: string): AcpMessage {
	return {
		id: "m1",
		role: "assistant",
		parts: [
			{ type: "text", text },
			{ type: "tool_call", id: "t1", name: "read", status: "pending" },
		],
	} as AcpMessage;
}

describe("pendingTokenSuffix", () => {
	it("renders nothing when the message already has the streamed text", () => {
		// A `message` event carries cumulative text, so the token that produced
		// it must not be appended a second time.
		expect(pendingTokenSuffix(assistant("Hello "), "Hello ")).toBe("");
	});

	it("renders only the part beyond the authoritative text", () => {
		expect(pendingTokenSuffix(assistant("Hello "), "Hello world")).toBe(
			"world",
		);
	});

	it("renders the whole token when the message is still empty", () => {
		expect(pendingTokenSuffix(assistant(""), "Hi")).toBe("Hi");
	});

	it("renders nothing when the message is ahead of the token stream", () => {
		expect(pendingTokenSuffix(assistant("Hello world!"), "Hello")).toBe("");
	});

	it("renders nothing when the streams diverge", () => {
		// A rewrite or replayed transcript: the message event is authoritative.
		expect(pendingTokenSuffix(assistant("Goodbye"), "Hello there")).toBe("");
	});

	it("accounts for text split across multiple parts", () => {
		expect(
			pendingTokenSuffix(assistant("Hello ", "world"), "Hello world!"),
		).toBe("!");
	});

	it("never double-renders across a coalesced message event", () => {
		// The reported bug: tokens kept appending text the message already had,
		// so streaming text visibly duplicated until the next message event.
		let message = assistant("");
		let streamed = "";
		for (const token of ["Hel", "lo", " world"]) {
			streamed += token;
			const suffix = pendingTokenSuffix(message, streamed);
			if (suffix) {
				message = { ...message, parts: appendTextPart(message, suffix) };
			}
		}
		expect(messageText(message)).toBe("Hello world");
	});
});

describe("appendTextPart", () => {
	it("extends a trailing text part", () => {
		const parts = appendTextPart(assistant("Hello"), " world");
		expect(parts).toHaveLength(1);
		expect((parts[0] as { text: string }).text).toBe("Hello world");
	});

	it("starts a new part when the message ends with a non-text part", () => {
		// Text after a tool call must not be merged into the pre-tool text.
		const parts = appendTextPart(withTool("Before"), "After");
		expect(parts).toHaveLength(3);
		expect((parts[2] as { text: string }).text).toBe("After");
	});
});

describe("messageText", () => {
	it("concatenates text parts and ignores others", () => {
		expect(messageText(withTool("only text"))).toBe("only text");
	});
});
