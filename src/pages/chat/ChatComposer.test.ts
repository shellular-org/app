import { cleanup, render, screen } from "@testing-library/react";
import { createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatComposer, readComposerParts } from "./ChatComposer";

afterEach(cleanup);

describe("readComposerParts", () => {
	it("preserves newlines created by contenteditable block elements", () => {
		const root = document.createElement("div");
		root.innerHTML = "<div>first line</div><div>second line</div>";

		expect(readComposerParts(root)).toEqual([
			{ type: "text", text: "first line\nsecond line" },
		]);
	});

	it("marks the composer for pane-relative desktop positioning", () => {
		render(
			createElement(ChatComposer, {
				inputBarRef: createRef<HTMLDivElement>(),
				inputRef: createRef<HTMLDivElement>(),
				agentAvailable: true,
				isConnected: true,
				isStreaming: false,
				canSendPrompt: true,
				promptSuggestions: [],
				activePromptSuggestionIndex: -1,
				configControls: null,
				imageAttachments: [],
				reviewCommentCount: 0,
				onOpenGitReview: vi.fn(),
				onClearReviewComments: vi.fn(),
				onPromptSuggestion: vi.fn(),
				onPromptSuggestionHover: vi.fn(),
				onInput: vi.fn(),
				onKeyDown: vi.fn(),
				onPaste: vi.fn(),
				onAttachFiles: vi.fn(),
				onRemoveImageAttachment: vi.fn(),
				onSend: vi.fn(),
				onStop: vi.fn(),
			}),
		);

		expect(
			screen.getByRole("textbox").closest(".chat-composer"),
		).not.toBeNull();
	});
});
