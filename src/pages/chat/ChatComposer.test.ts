import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ChatComposer,
	readComposerParts,
	restoreComposerDraft,
	saveComposerDraft,
	shouldSubmitComposerOnEnter,
} from "./ChatComposer";

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

function renderComposer(
	overrides: Partial<Parameters<typeof ChatComposer>[0]> = {},
) {
	const props: Parameters<typeof ChatComposer>[0] = {
		inputBarRef: createRef<HTMLDivElement>(),
		inputRef: createRef<HTMLDivElement>(),
		agentAvailable: true,
		isConnected: true,
		isStreaming: false,
		canSendPrompt: true,
		promptSuggestions: [],
		activePromptSuggestionIndex: 0,
		configControls: null,
		imageAttachments: [],
		reviewCommentCount: 0,
		onOpenGitReview: vi.fn(),
		onClearReviewComments: vi.fn(),
		onPromptSuggestion: vi.fn(),
		onPromptSuggestionHover: vi.fn(),
		onInput: vi.fn(),
		onPaste: vi.fn(),
		onAttachFiles: vi.fn(),
		onRemoveImageAttachment: vi.fn(),
		onSend: vi.fn(),
		onStop: vi.fn(),
		...overrides,
	};
	render(createElement(ChatComposer, props));
	return props;
}

describe("readComposerParts", () => {
	it("preserves newlines created by contenteditable block elements", () => {
		const root = document.createElement("div");
		root.innerHTML = "<div>first line</div><div>second line</div>";

		expect(readComposerParts(root)).toEqual([
			{ type: "text", text: "first line\nsecond line" },
		]);
	});

	it("marks the composer for pane-relative desktop positioning", () => {
		renderComposer();

		expect(
			screen.getByRole("textbox").closest(".chat-composer"),
		).not.toBeNull();
	});
});

describe("composer drafts", () => {
	it("restores unsent content after the editable DOM is rebuilt", () => {
		const root = document.createElement("div");
		root.innerHTML = "first line<div>second line</div>";
		const original = root.innerHTML;
		const key = "test-draft-restore";
		saveComposerDraft(key, root);
		root.replaceChildren();

		expect(restoreComposerDraft(key, root)).toBe(true);
		expect(root.innerHTML).toBe(original);

		root.replaceChildren();
		saveComposerDraft(key, root);
	});
});

describe("desktop composer keys", () => {
	it("sends on Enter and leaves Shift+Enter to create a newline", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		const onSend = vi.fn();
		renderComposer({ onSend });
		const textbox = screen.getByRole("textbox");

		const enter = new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
			cancelable: true,
		});
		textbox.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(true);
		expect(onSend).toHaveBeenCalledTimes(1);

		const newline = new KeyboardEvent("keydown", {
			key: "Enter",
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		textbox.dispatchEvent(newline);
		expect(newline.defaultPrevented).toBe(false);
		expect(onSend).toHaveBeenCalledTimes(1);
	});

	it("uses Enter for the highlighted suggestion before sending", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		const onSend = vi.fn();
		const onPromptSuggestion = vi.fn();
		const suggestion = {
			id: "command-review",
			trigger: "/" as const,
			title: "review",
			icon: "icon-box",
			replacement: "/review ",
		};
		renderComposer({
			onSend,
			onPromptSuggestion,
			promptSuggestions: [suggestion],
		});

		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

		expect(onPromptSuggestion).toHaveBeenCalledWith(suggestion);
		expect(onSend).not.toHaveBeenCalled();
	});

	it("saves a queued edit on Enter", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		const onSaveQueuedPrompt = vi.fn();
		renderComposer({ isEditingQueuedPrompt: true, onSaveQueuedPrompt });

		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

		expect(onSaveQueuedPrompt).toHaveBeenCalledTimes(1);
	});

	it("does not submit while composing text or while a submit is pending", () => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		const composingSend = vi.fn();
		renderComposer({ onSend: composingSend });
		fireEvent.keyDown(screen.getByRole("textbox"), {
			key: "Enter",
			isComposing: true,
		});
		expect(composingSend).not.toHaveBeenCalled();

		cleanup();
		const pendingSend = vi.fn();
		renderComposer({ onSend: pendingSend, isSubmitting: true });
		const pendingTextbox = screen.getByRole("textbox");
		expect(pendingTextbox).toHaveAttribute("contenteditable", "false");
		fireEvent.keyDown(pendingTextbox, { key: "Enter" });
		expect(pendingSend).not.toHaveBeenCalled();
	});

	it("does not intercept Enter on coarse-pointer mobile browsers", () => {
		expect(shouldSubmitComposerOnEnter(true, true, true)).toBe(false);
		expect(shouldSubmitComposerOnEnter(true, true, false)).toBe(true);
		expect(shouldSubmitComposerOnEnter(true, false, true)).toBe(true);
		expect(shouldSubmitComposerOnEnter(false, false, false)).toBe(false);
	});
});
