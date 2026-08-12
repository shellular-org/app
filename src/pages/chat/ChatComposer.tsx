import { Combobox, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import type {
	AcpAvailableCommand,
	AcpContentBlock,
	AcpMessagePart,
} from "@shellular/protocol";
import native from "bridge/native";
import { getFileIcon } from "lib/fileIcon";
import { joinRemotePath } from "lib/remotePath";
import { formatFileSize, getFileMimeType } from "lib/utils";
import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { listDir, ProjectFileSearchEntry } from "state/filesystem";
import { escapeHtml, fileUri } from "./chat-bubble/lib/utils";

export type PromptSuggestion = {
	id: string;
	trigger: "/" | "@";
	title: string;
	description?: string;
	hint?: string;
	icon: string;
	replacement: string;
	file?: ProjectFileSearchEntry;
};

export type ComposerAttachment = {
	id: string;
	path: string;
	relativePath: string;
	name: string;
	size?: number;
	mimeType?: string;
	status?: "pending" | "error";
};

export type ComposerPart =
	| { type: "text"; text: string }
	| { type: "attachment"; attachment: ComposerAttachment };

export type ComposerTrigger = {
	trigger: "/" | "@";
	query: string;
	start: number;
	end: number;
} | null;

type ChatComposerProps = {
	inputBarRef: React.RefObject<HTMLDivElement | null>;
	inputRef: React.RefObject<HTMLDivElement | null>;
	agentAvailable: boolean;
	isConnected: boolean;
	unavailableMessage?: string;
	isStreaming: boolean;
	canSendPrompt: boolean;
	/**
	 * Why sending is blocked, if it is. When set and the user taps the (visually
	 * disabled) send button, we surface this as a toast instead of silently doing
	 * nothing — so a background upload or dropped connection is legible.
	 */
	sendBlockedReason?: string | null;
	promptSuggestions: PromptSuggestion[];
	activePromptSuggestionIndex: number;
	configControls: React.ReactNode;
	contextMeter?: React.ReactNode;
	queueControls?: React.ReactNode;
	isEditingQueuedPrompt?: boolean;
	imageAttachments: ComposerAttachment[];
	onPromptSuggestion: (suggestion: PromptSuggestion) => void;
	onPromptSuggestionHover: (index: number) => void;
	onInput: () => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
	onPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void;
	onAttachFiles: (files: File[]) => void;
	onRemoveImageAttachment: (id: string) => void;
	onSend: () => void;
	onStop: () => void;
};

export function ChatComposer({
	inputBarRef,
	inputRef,
	agentAvailable,
	isConnected,
	unavailableMessage,
	isStreaming,
	canSendPrompt,
	sendBlockedReason,
	promptSuggestions,
	activePromptSuggestionIndex,
	configControls,
	contextMeter,
	queueControls,
	isEditingQueuedPrompt = false,
	imageAttachments,
	onPromptSuggestion,
	onPromptSuggestionHover,
	onInput,
	onKeyDown,
	onPaste,
	onAttachFiles,
	onRemoveImageAttachment,
	onSend,
	onStop,
}: ChatComposerProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileInputChange = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		if (files.length) onAttachFiles(files);
	};

	const handleComposerPointerDown = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		const target = event.target as HTMLElement | null;
		const chip = target?.closest<HTMLElement>(".composer-attachment");
		const root = inputRef.current;
		if (!chip || !root?.contains(chip)) return;

		event.preventDefault();
		const rect = chip.getBoundingClientRect();
		placeCaretAdjacentToNode(
			root,
			chip,
			event.clientX > rect.left + rect.width / 2 ? "after" : "before",
		);
		onInput();
	};

	return (
		<div
			ref={inputBarRef}
			className="fixed bottom-[calc(var(--keyboard-height,0px)+8px)] left-[max(10px,var(--sal))] right-[max(10px,var(--sar))] mx-auto flex w-auto max-w-[840px] flex-col gap-2 rounded-xl border border-card-border bg-secondary p-3 shadow-[0_10px_36px_var(--shadow-color),0_1px_0_var(--line-soft)_inset] transition-[border-radius,padding] duration-300 ease-in ios:rounded-[12px_12px_48px_48px] md:ios:rounded-xl ios-kbd:rounded-xl android:bottom-[max(8px,var(--sab))] android-kbd:bottom-[calc(var(--keyboard-height,8px)+8px)] browser:w-[calc(100%-32px)] browser:max-w-[1150px]"
		>
			{queueControls}
			{imageAttachments.length > 0 && (
				<AttachmentBadgeRow
					attachments={imageAttachments}
					onRemove={onRemoveImageAttachment}
				/>
			)}
			<Combobox
				value={null}
				onChange={(suggestion: PromptSuggestion | null) => {
					if (suggestion) onPromptSuggestion(suggestion);
				}}
				as="div"
				className="flex min-w-0 flex-col"
				disabled={!agentAvailable || !isConnected}
			>
				{promptSuggestions.length > 0 && (
					<ComboboxOptions
						static
						id="chat-prompt-suggestions"
						className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-[10001] flex max-h-[min(300px,calc(100dvh-230px))] flex-col gap-1 overflow-y-auto rounded-xl border border-popup-border-color bg-popup-background p-1.5 shadow-[0_10px_32px_var(--shadow-color)] [animation:fade-in_120ms_ease_both] [backdrop-filter:var(--popup-backdrop-filter)] [-webkit-backdrop-filter:var(--popup-backdrop-filter)]"
						aria-label="Prompt suggestions"
					>
						{promptSuggestions.map((suggestion, index) => (
							<ComboboxOption
								key={suggestion.id}
								value={suggestion}
								className={({ focus }) =>
									`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left font-[inherit] text-[13px] text-primary-text hover:bg-popup-active-background hover:text-popup-active-text focus:bg-popup-active-background focus:text-popup-active-text ${focus || index === activePromptSuggestionIndex ? "bg-popup-active-background text-popup-active-text" : ""}`
								}
								onMouseEnter={() => onPromptSuggestionHover(index)}
							>
								<span
									className={`${suggestion.icon} shrink-0 text-accent`}
									aria-hidden="true"
								/>
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold">
										{suggestion.trigger}
										{suggestion.title}
									</strong>
									{suggestion.description && (
										<em className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] not-italic text-secondary-text opacity-75">
											{suggestion.description}
										</em>
									)}
								</span>
								{suggestion.hint && (
									<span className="max-w-[38%] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-secondary-text opacity-65">
										{suggestion.hint}
									</span>
								)}
							</ComboboxOption>
						))}
					</ComboboxOptions>
				)}
				{/* biome-ignore lint/a11y/useSemanticElements: inline attachment chips require contenteditable markup. */}
				<div
					ref={(element) => {
						inputRef.current = element;
					}}
					className="relative max-h-[120px] min-h-[58px] w-full cursor-text overflow-y-auto bg-secondary px-0.5 py-0 font-[inherit] text-[14px] leading-[1.5] text-primary-text outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [user-select:text] [-webkit-overflow-scrolling:touch] [-webkit-tap-highlight-color:transparent] before:pointer-events-none before:absolute before:left-0.5 before:top-0 before:text-secondary-text before:opacity-40 data-[empty=true]:before:content-[attr(data-placeholder)] focus:outline-none aria-disabled:opacity-40"
					// Stays editable while the connection is down: a reconnect is
					// usually brief, and losing what you were mid-sentence on is worse
					// than being able to type something you can't send yet. Sending is
					// gated separately by canSendPrompt.
					contentEditable={agentAvailable}
					suppressContentEditableWarning
					role="textbox"
					tabIndex={agentAvailable ? 0 : -1}
					aria-multiline="true"
					data-placeholder="Ask anything or use / or @..."
					data-empty={
						!inputRef.current?.textContent.trim() ? "true" : undefined
					}
					onInput={onInput}
					onKeyDown={onKeyDown}
					onPointerDown={handleComposerPointerDown}
					onPaste={onPaste}
					aria-controls={
						promptSuggestions.length > 0 ? "chat-prompt-suggestions" : undefined
					}
					onClick={
						!agentAvailable && unavailableMessage
							? () => native.toast(unavailableMessage)
							: undefined
					}
					aria-disabled={!agentAvailable || !isConnected}
				/>
			</Combobox>
			<div className="flex min-w-0 items-center gap-2 ios:px-3 ios-kbd:p-0">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					multiple
					className="hidden"
					tabIndex={-1}
					aria-hidden="true"
					onChange={handleFileInputChange}
				/>
				<div className="flex min-w-0 flex-1 items-center gap-0.5">
					<button
						type="button"
						className="haptic-trigger flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent p-0 text-[1.15rem] text-secondary-text transition-[background,opacity] duration-150 active:bg-surface-soft disabled:cursor-default disabled:opacity-35 [-webkit-tap-highlight-color:transparent]"
						onClick={() => fileInputRef.current?.click()}
						disabled={!agentAvailable || !isConnected}
						aria-label="Attach image"
					>
						<span className="icon-image" aria-hidden="true" />
					</button>
					<div className="z-0 flex min-w-0 flex-1 items-center justify-start gap-1.5">
						{configControls}
					</div>
				</div>
				{contextMeter}
				{isEditingQueuedPrompt ? null : isStreaming && !canSendPrompt ? (
					<button
						type="button"
						className="haptic-trigger flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent p-0 text-[1.15rem] text-danger transition-opacity duration-150 [-webkit-tap-highlight-color:transparent]"
						onClick={onStop}
						aria-label="Stop generation"
					>
						<span className="icon-stop-circle" aria-hidden="true" />
					</button>
				) : (
					<button
						type="button"
						// Kept tappable even when it can't send, so tapping can explain
						// *why* (e.g. an image is still uploading) via a toast instead of
						// silently doing nothing. The dimmed look is a class, not the
						// native `disabled` attribute, which would swallow the tap.
						className={`haptic-trigger flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent p-0 text-[1.15rem] text-[var(--active-text-color)] transition-opacity duration-150 disabled:opacity-35 [-webkit-tap-highlight-color:transparent] ${canSendPrompt && isConnected && agentAvailable ? "" : "opacity-35"}`}
						onClick={() => {
							if (canSendPrompt && isConnected && agentAvailable) {
								onSend();
							} else if (sendBlockedReason) {
								native.toast(sendBlockedReason);
							}
						}}
						aria-disabled={!canSendPrompt || !isConnected || !agentAvailable}
						aria-label={isStreaming ? "Queue prompt" : "Send"}
					>
						<span className="icon-send" aria-hidden="true" />
					</button>
				)}
			</div>
		</div>
	);
}

// Attached images sit in one horizontally-scrollable row so they never eat
// vertical space on a phone. Because the scrollbar is hidden, a "+N" pill in the
// corner tells the user how many badges are scrolled off the right edge, and
// disappears once the row is fully in view (or fits without scrolling).
function AttachmentBadgeRow({
	attachments,
	onRemove,
}: {
	attachments: ComposerAttachment[];
	onRemove: (id: string) => void;
}) {
	const rowRef = useRef<HTMLDivElement>(null);
	const [hiddenCount, setHiddenCount] = useState(0);

	const measure = useCallback(() => {
		const row = rowRef.current;
		if (!row) return;
		const badges = row.querySelectorAll<HTMLElement>(".chat-attachment-badge");
		// A badge counts as hidden once its right edge sits past the row's right
		// edge (with a small tolerance so a fully-visible last chip never counts).
		const rowRight = row.scrollLeft + row.clientWidth;
		let hidden = 0;
		for (const badge of badges) {
			if (badge.offsetLeft + badge.offsetWidth > rowRight + 1) hidden += 1;
		}
		setHiddenCount(hidden);
	}, []);

	useLayoutEffect(() => {
		measure();
		const row = rowRef.current;
		if (!row) return;
		const observer = new ResizeObserver(measure);
		observer.observe(row);
		return () => observer.disconnect();
	}, [measure]);

	return (
		<div className="relative mx-[-12px]">
			<div
				ref={rowRef}
				className="flex snap-x snap-proximity flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden px-3 pb-px [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
				onScroll={measure}
			>
				{attachments.map((attachment) => (
					<ImageAttachmentBadge
						key={attachment.id}
						attachment={attachment}
						onRemove={() => onRemove(attachment.id)}
					/>
				))}
			</div>
			{hiddenCount > 0 && (
				<span
					className="pointer-events-none absolute right-0 top-0 bottom-px inline-flex items-center bg-[linear-gradient(to_right,transparent,var(--secondary)_40%)] px-3 pl-6 text-[11px] font-semibold leading-none text-secondary-text"
					title={`${hiddenCount} more attachment${hiddenCount > 1 ? "s" : ""}`}
				>
					+{hiddenCount}
				</span>
			)}
		</div>
	);
}

function ImageAttachmentBadge({
	attachment,
	onRemove,
}: {
	attachment: ComposerAttachment;
	onRemove: () => void;
}) {
	const icon = getFileIcon(attachment.name);
	const className = [
		"chat-attachment-badge inline-flex h-[26px] shrink-0 snap-start items-center gap-[5px] rounded-lg border border-border-color bg-surface-soft px-1 pl-2 text-[12px] leading-none text-accent",
		attachment.status === "pending"
			? "border-dashed text-secondary-text opacity-[0.82]"
			: "",
		attachment.status === "error" ? "border-error text-error" : "",
	]
		.filter(Boolean)
		.join(" ");
	const statusIcon =
		attachment.status === "pending"
			? "icon-clock"
			: attachment.status === "error"
				? "icon-alert-triangle"
				: null;
	return (
		<span
			className={className}
			title={
				attachment.status === "pending"
					? "Saving image…"
					: attachment.status === "error"
						? "Image failed to save"
						: attachment.relativePath
			}
		>
			<span className={`shrink-0 text-[13px] ${icon}`} aria-hidden="true" />
			<span className="min-w-0 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
				{attachment.relativePath}
			</span>
			{statusIcon && (
				<span
					className={`shrink-0 text-[12px] opacity-85 ${statusIcon}`}
					aria-hidden="true"
				/>
			)}
			<button
				type="button"
				className="haptic-trigger flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[12px] text-secondary-text transition-[background,color] duration-150 [-webkit-tap-highlight-color:transparent] active:bg-card-border active:text-primary-text"
				onClick={onRemove}
				aria-label={`Remove ${attachment.relativePath}`}
			>
				<span className="icon-x" aria-hidden="true" />
			</button>
		</span>
	);
}

export function readComposerParts(root: HTMLDivElement | null): ComposerPart[] {
	if (!root) return [];
	const parts: ComposerPart[] = [];
	const appendText = (text: string) => {
		if (!text) return;
		const last = parts[parts.length - 1];
		if (last?.type === "text") {
			last.text += text;
		} else {
			parts.push({ type: "text", text });
		}
	};

	const readNode = (node: ChildNode) => {
		if (node.nodeType === Node.TEXT_NODE) {
			appendText(node.textContent ?? "");
			return;
		}
		if (!(node instanceof HTMLElement)) return;
		if (node.dataset.composerAttachment === "true") {
			const path = node.dataset.path ?? "";
			parts.push({
				type: "attachment",
				attachment: {
					id: node.dataset.id || `att:${path || Date.now().toString(36)}`,
					path,
					relativePath: node.dataset.relativePath || path || "Attachment",
					name: node.dataset.name || path.split("/").pop() || "Attachment",
					size: node.dataset.size ? Number(node.dataset.size) : undefined,
					mimeType: node.dataset.mimeType || getFileMimeType(path),
					status: readAttachmentStatus(node),
				},
			});
			return;
		}
		if (node.tagName === "BR") {
			appendText("\n");
			return;
		}
		const isBlock = ["DIV", "LI", "P", "BLOCKQUOTE", "PRE"].includes(
			node.tagName,
		);
		if (isBlock && parts.length > 0) appendText("\n");
		for (const child of Array.from(node.childNodes)) {
			readNode(child);
		}
	};

	for (const node of Array.from(root.childNodes)) {
		readNode(node);
	}

	return parts.filter(
		(part) => part.type === "attachment" || part.text.length > 0,
	);
}

export function fileSuggestionFromSearchEntry(
	entry: ProjectFileSearchEntry,
): PromptSuggestion {
	return {
		id: `file:${entry.path}`,
		trigger: "@",
		title: entry.relativePath || entry.name,
		description:
			entry.type === "directory" ? "Directory" : formatFileSize(entry.size),
		hint: entry.gitStatus,
		icon: entry.type === "directory" ? "icon-folder" : getFileIcon(entry.name),
		replacement: entry.relativePath || entry.path,
		file: entry,
	};
}

export function fileSuggestionFromDirectoryEntry(
	entry: Awaited<ReturnType<typeof listDir>>[number],
	workspacePath: string,
): PromptSuggestion {
	const path = joinRemotePath(workspacePath, entry.name);
	return fileSuggestionFromSearchEntry({
		...entry,
		path,
		relativePath: entry.name,
	});
}

export function composerPartsToText(parts: ComposerPart[]) {
	return parts
		.map((part) =>
			part.type === "text" ? part.text : `@${part.attachment.relativePath}`,
		)
		.join("");
}

export function composerPartsToMessageParts(
	parts: ComposerPart[],
): AcpMessagePart[] {
	return parts.flatMap<AcpMessagePart>((part) => {
		if (part.type === "text") {
			return part.text ? [{ type: "text" as const, text: part.text }] : [];
		}
		return [
			{
				type: "file_reference" as const,
				path: part.attachment.path,
				name: part.attachment.name,
				title: part.attachment.relativePath,
				size: part.attachment.size,
				mimeType: part.attachment.mimeType,
				rawContent: resourceLinkForAttachment(part.attachment),
			},
		];
	});
}

export async function composerPartsToAcpContent(
	parts: ComposerPart[],
): Promise<AcpContentBlock[]> {
	const blocks: AcpContentBlock[] = [];
	for (const part of parts) {
		if (part.type === "text") {
			if (part.text) blocks.push({ type: "text", text: part.text });
			continue;
		}

		blocks.push(resourceLinkForAttachment(part.attachment) as AcpContentBlock);
	}
	return blocks;
}

export function clearComposer(root: HTMLDivElement | null) {
	if (root) root.replaceChildren();
}

export function replaceComposerParts(
	root: HTMLDivElement | null,
	parts: ComposerPart[],
) {
	if (!root) return;
	root.replaceChildren(...composerPartsToNodes(parts));
	placeCaretAtOffset(root, composerPartsToText(parts).length);
}

/**
 * Unsent composer content, keyed by chat. Lives at module scope rather than in
 * component state because the chat page remounts constantly — on reconnect, on
 * resume, on navigating away and back — and a draft that dies with the
 * component is the bug this exists to prevent.
 *
 * Holds serialized HTML so attachment chips survive alongside plain text.
 * Deliberately not persisted: a draft is worth keeping across a blip, not
 * across an app relaunch.
 */
const composerDrafts = new Map<string, string>();

/**
 * Whether the composer holds anything worth keeping. An "empty" composer still
 * carries stray markup (a trailing <br>, an empty div), and one holding only an
 * @-mention or image chip has no text — so neither innerHTML nor textContent
 * alone answers this.
 */
function isComposerEmpty(root: HTMLDivElement): boolean {
	if (root.textContent?.trim()) return false;
	return !root.querySelector('[data-composer-attachment="true"]');
}

/** Record (or, once the composer is empty, forget) this chat's unsent draft. */
export function saveComposerDraft(key: string, root: HTMLDivElement | null) {
	if (!root || isComposerEmpty(root)) {
		composerDrafts.delete(key);
		return;
	}
	composerDrafts.set(key, root.innerHTML);
}

/**
 * Put this chat's draft back into an empty composer. No-ops when the composer
 * already has content, so it is safe to call on every render — the restore is
 * driven by "the DOM lost the text", which React can't tell us directly.
 * Returns whether anything was restored.
 */
export function restoreComposerDraft(
	key: string,
	root: HTMLDivElement | null,
): boolean {
	const draft = composerDrafts.get(key);
	if (!root || !draft || !isComposerEmpty(root)) return false;
	root.innerHTML = draft;
	// data-empty is computed from a ref during render, so it still reads "true"
	// on the commit that restored this text; clear it or the placeholder flashes
	// over the draft until the next render.
	root.removeAttribute("data-empty");
	return true;
}

export function insertAttachmentSuggestion(
	root: HTMLDivElement | null,
	file: ProjectFileSearchEntry,
	trigger: ComposerTrigger,
) {
	if (!root) return;
	const attachment: ComposerAttachment = {
		id: `att:${file.path}:${Date.now().toString(36)}`,
		path: file.path,
		relativePath: file.relativePath || file.name,
		name: file.name,
		size: file.size,
		mimeType: getFileMimeType(file.path),
	};
	replaceComposerRange(root, trigger, [
		{ type: "attachment", attachment },
		{ type: "text", text: " " },
	]);
}

export function insertComposerParts(
	root: HTMLDivElement | null,
	parts: ComposerPart[],
	options?: { atEnd?: boolean },
) {
	if (!root || !parts.length) return;
	// When triggered from a control that steals focus (e.g. the attach button),
	// the composer's caret/selection is gone, so cursor-relative insertion is
	// unreliable. Append at the end of the existing text instead.
	const offset = options?.atEnd
		? getComposerTextLength(root)
		: getComposerCursorOffset(root);
	replaceComposerRange(
		root,
		{
			trigger: "/" as const,
			query: "",
			start: offset,
			end: offset,
		},
		parts,
	);
}

export function updateComposerAttachment(
	root: HTMLDivElement | null,
	id: string,
	attachment: ComposerAttachment,
) {
	if (!root) return;
	const chip = root.querySelector<HTMLElement>(
		`[data-composer-attachment="true"][data-id="${CSS.escape(id)}"]`,
	);
	if (!chip) return;
	applyAttachmentChipData(chip, attachment);
}

export function replaceComposerTrigger(
	root: HTMLDivElement | null,
	trigger: ComposerTrigger,
	text: string,
) {
	if (!root) return;
	replaceComposerRange(root, trigger, [{ type: "text", text }]);
}

export function findComposerTrigger(
	root: HTMLDivElement | null,
): ComposerTrigger {
	if (!root) return null;
	const text = getComposerLinearText(root);
	const cursor = getComposerCursorOffset(root);
	const before = text.slice(0, cursor);
	const match = before.match(/(^|\s)([/@])([^\s/@]*)$/);
	if (!match) return null;
	const trigger = match[2] as "/" | "@";
	const query = match[3] ?? "";
	const start = before.length - match[2].length - query.length;
	return { trigger, query, start, end: cursor };
}

export function getPromptSuggestions(
	query: string,
	commands: AcpAvailableCommand[],
): PromptSuggestion[] {
	const normalizedQuery = query.toLowerCase();
	return commands
		.filter((command) => command.name.toLowerCase().startsWith(normalizedQuery))
		.slice(0, 8)
		.map((command) => ({
			id: `command:${command.name}`,
			trigger: "/",
			title: command.name,
			description: command.description,
			hint: command.input?.hint,
			icon: "icon-box",
			replacement: `/${command.name}${command.input ? " " : ""}`,
		}));
}

function resourceLinkForAttachment(attachment: ComposerAttachment) {
	return {
		type: "resource_link",
		uri: fileUri(attachment.path),
		name: attachment.name,
		title: attachment.relativePath,
		mimeType: attachment.mimeType,
		size: attachment.size,
	};
}

function replaceComposerRange(
	root: HTMLDivElement,
	trigger: ComposerTrigger,
	replacement: ComposerPart[],
) {
	const parts = readComposerParts(root);
	const text = composerPartsToText(parts);
	const rangeInfo = trigger ?? {
		trigger: "/" as const,
		query: "",
		start: text.length,
		end: text.length,
	};
	const nextParts = [
		...sliceComposerParts(parts, 0, rangeInfo.start),
		...replacement,
		...sliceComposerParts(parts, rangeInfo.end, text.length),
	];
	root.replaceChildren(...composerPartsToNodes(nextParts));
	placeCaretAtOffset(
		root,
		rangeInfo.start + composerPartsToText(replacement).length,
	);
}

function composerPartsToNodes(parts: ComposerPart[]): Node[] {
	return parts.flatMap<Node>((part) => {
		if (part.type === "text") {
			return part.text ? [document.createTextNode(part.text)] : [];
		}
		return [createAttachmentChip(part.attachment)];
	});
}

function sliceComposerParts(parts: ComposerPart[], start: number, end: number) {
	const result: ComposerPart[] = [];
	let offset = 0;
	for (const part of parts) {
		const value =
			part.type === "text" ? part.text : `@${part.attachment.relativePath}`;
		const partStart = offset;
		const partEnd = offset + value.length;
		offset = partEnd;
		if (partEnd <= start || partStart >= end) continue;
		if (part.type === "attachment") {
			if (start <= partStart && end >= partEnd) result.push(part);
			continue;
		}
		const localStart = Math.max(0, start - partStart);
		const localEnd = Math.min(value.length, end - partStart);
		const text = value.slice(localStart, localEnd);
		if (text) result.push({ type: "text", text });
	}
	return result;
}

function createAttachmentChip(attachment: ComposerAttachment) {
	const chip = document.createElement("span");
	applyAttachmentChipData(chip, attachment);
	return chip;
}

function applyAttachmentChipData(
	chip: HTMLElement,
	attachment: ComposerAttachment,
) {
	const icon = getFileIcon(attachment.name);
	chip.className = [
		"composer-attachment inline-flex max-w-[min(100%,280px)] items-center gap-1 overflow-hidden rounded-md border border-border-color bg-surface-soft px-[5px] py-px align-baseline font-['JetBrainsMono_Nerd_Font',ui-monospace,Menlo,monospace] text-[0.9em] text-accent [user-select:none] [-webkit-user-select:none]",
		attachment.status === "pending"
			? "border-dashed text-secondary-text opacity-[0.82]"
			: "",
		attachment.status === "error" ? "border-error text-error" : "",
	]
		.filter(Boolean)
		.join(" ");
	chip.contentEditable = "false";
	chip.dataset.composerAttachment = "true";
	chip.dataset.id = attachment.id;
	chip.dataset.path = attachment.path;
	chip.dataset.relativePath = attachment.relativePath;
	chip.dataset.name = attachment.name;
	if (attachment.size !== undefined) {
		chip.dataset.size = String(attachment.size);
	} else {
		delete chip.dataset.size;
	}
	if (attachment.mimeType) {
		chip.dataset.mimeType = attachment.mimeType;
	} else {
		delete chip.dataset.mimeType;
	}
	if (attachment.status) {
		chip.dataset.status = attachment.status;
	} else {
		delete chip.dataset.status;
	}
	chip.title =
		attachment.status === "pending"
			? "Saving image..."
			: attachment.status === "error"
				? "Image failed to save"
				: attachment.relativePath;
	const statusIcon =
		attachment.status === "pending"
			? '<span class="icon-clock shrink-0 text-[0.95em] opacity-85" aria-hidden="true"></span>'
			: attachment.status === "error"
				? '<span class="icon-alert-triangle shrink-0 text-[0.95em] opacity-85" aria-hidden="true"></span>'
				: "";
	chip.innerHTML = `<span class="${icon} shrink-0" aria-hidden="true"></span><span class="min-w-0 overflow-hidden text-ellipsis">${escapeHtml(attachment.relativePath)}</span>${statusIcon}`;
}

function readAttachmentStatus(node: HTMLElement): ComposerAttachment["status"] {
	const status = node.dataset.status;
	return status === "pending" || status === "error" ? status : undefined;
}

function getComposerLinearText(root: HTMLDivElement) {
	return readComposerParts(root)
		.map((part) =>
			part.type === "text" ? part.text : `@${part.attachment.relativePath}`,
		)
		.join("");
}

function getComposerTextLength(root: HTMLDivElement) {
	return getComposerLinearText(root).length;
}

function getComposerCursorOffset(root: HTMLDivElement) {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0)
		return getComposerLinearText(root).length;
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer))
		return getComposerLinearText(root).length;
	let offset = 0;
	for (const node of Array.from(root.childNodes)) {
		if (node === range.startContainer) {
			return offset + range.startOffset;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			if (node === range.startContainer) return offset + range.startOffset;
			offset += node.textContent?.length ?? 0;
			continue;
		}
		if (node instanceof HTMLElement) {
			if (node.dataset.composerAttachment === "true") {
				if (node.contains(range.startContainer)) return offset;
				offset += `@${node.dataset.relativePath || node.dataset.path || ""}`
					.length;
				continue;
			}
			if (node.contains(range.startContainer)) {
				return offset + range.startOffset;
			}
			offset += node.innerText.length;
		}
	}
	return offset;
}

function placeCaretAtOffset(root: HTMLDivElement, targetOffset: number) {
	root.focus();
	const range = document.createRange();
	let offset = 0;

	for (const node of Array.from(root.childNodes)) {
		const length = composerNodeLength(node);
		if (targetOffset <= offset + length) {
			if (node.nodeType === Node.TEXT_NODE) {
				range.setStart(node, Math.max(0, targetOffset - offset));
			} else if (targetOffset <= offset) {
				range.setStartBefore(node);
			} else {
				range.setStartAfter(node);
			}
			range.collapse(true);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			return;
		}
		offset += length;
	}

	range.selectNodeContents(root);
	range.collapse(false);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

function placeCaretAdjacentToNode(
	root: HTMLDivElement,
	node: Node,
	position: "before" | "after",
) {
	root.focus();
	const range = document.createRange();
	if (position === "before") {
		range.setStartBefore(node);
	} else {
		range.setStartAfter(node);
	}
	range.collapse(true);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

function composerNodeLength(node: ChildNode) {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
	if (node instanceof HTMLElement) {
		if (node.dataset.composerAttachment === "true") {
			return `@${node.dataset.relativePath || node.dataset.path || ""}`.length;
		}
		if (node.tagName === "BR") return 1;
		return node.innerText.length;
	}
	return 0;
}
