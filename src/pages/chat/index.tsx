import "./style.scss";
import { closePage, pushPage } from "App";
import type {
	AcpAvailableCommand,
	AcpMessage,
	AcpMessagePart,
	AiBackend,
} from "@shellular/protocol";
import dialog from "bridge/dialog";
import native from "bridge/native";
import AppCombobox from "components/AppCombobox";
import AppSelect from "components/AppSelect";
import BottomSheet from "components/BottomSheet";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Page from "components/Page";
import actionStack from "lib/actionStack";
import { getAgentIcon } from "lib/agents";
import { registerShellularDiffThemes } from "lib/diffsTheme";
import keyboard from "lib/keyboard";
import { normalizeRemoteWorkspacePath } from "lib/remotePath";
import EditorPage from "pages/editor";
import {
	formatGitReviewPrompt,
	type GitReviewComment,
} from "pages/git-client/reviewComments";
import type React from "react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useShellular } from "state";
import type {
	AcpPermissionRequest,
	AcpPromptCallbacks,
	AcpPromptError,
	AcpSessionEvent,
	AiSessionConfigOption,
} from "state/acp";
import {
	type AcpElicitationRequest,
	type AcpQueuedPrompt,
	acpAttachSession,
	acpCancel,
	acpCreateSession,
	acpDetachSession,
	acpElicitationReply,
	acpKillSessionOwner,
	acpMessagesPage,
	acpPermissionReply,
	acpPrompt,
	acpQueuePrompt,
	acpRemoveQueuedPrompt,
	acpSetConfigOption,
	acpSetMode,
	acpSetPromptQueuePaused,
	acpSubscribeSessionEvents,
	acpUpdateQueuedPrompt,
	acpWriteAttachmentBase64,
	readElicitationRequest,
	readSessionOwnerError,
} from "state/acp";
import { recordChatTab } from "state/chatTabs";
import { listDir, searchProjectFiles } from "state/filesystem";
import {
	getSessionActivity,
	getSessionStreaming,
	isSettledSessionStatus,
	setSessionStreaming,
	subscribeSessionActivities,
} from "state/sessions";
import {
	ChatComposer,
	type ComposerAttachment,
	type ComposerPart,
	type ComposerTrigger,
	clearComposer,
	composerPartsToAcpContent,
	composerPartsToMessageParts,
	composerPartsToText,
	fileSuggestionFromDirectoryEntry,
	fileSuggestionFromSearchEntry,
	findComposerTrigger,
	getPromptSuggestions,
	insertAttachmentSuggestion,
	insertComposerParts,
	type PromptSuggestion,
	readComposerParts,
	replaceComposerParts,
	replaceComposerTrigger,
	restoreComposerDraft,
	saveComposerDraft,
} from "./ChatComposer";
import ChatSidebar from "./ChatSidebar";
import ChatBubble from "./chat-bubble";
import ElicitationCard from "./chat-bubble/components/ElicitationCard";
import PermissionRequestCard from "./chat-bubble/components/PermissionRequestCard";
import {
	formatStopReason,
	getMessageKey,
} from "./chat-bubble/lib/messageParts";
import { bytesToBase64, findLastIndex } from "./chat-bubble/lib/utils";
import {
	getAssistantTurnDurationMs,
	getElapsedDurationMs,
	projectAssistantTurn,
} from "./chat-bubble/lib/workLog";
import ContextWindowMeter from "./composer/ContextWindowMeter";
import {
	type ContextWindowUsage,
	formatTokenCount,
	getContextWindowPercentage,
	getContextWindowState,
	readContextWindowUsage,
} from "./composer/contextWindowUsage";
import {
	type DirectPromptDispatch,
	isQueuedPromptPlaceholderId,
	reconcilePromptQueueVisibility,
	shouldQueuePrompt,
} from "./lib/promptQueue";
import { appendTextPart, pendingTokenSuffix } from "./lib/streamText";
import { upsertMessage } from "./lib/upsertMessage";
import { normalizeEditorPath } from "./pathUtils";

const PAGE_SIZE = 30;
const STOP_REASON_METADATA = "stop-reason";
const reviewCommentDrafts = new Map<string, GitReviewComment[]>();
// Placeholder title used for not-yet-named chats. Treated as "no real title" so
// it never overwrites an actual session/activity title.
const PLACEHOLDER_TITLE = "New Chat";

function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return fallback;
}

function acpMessageText(message: AcpMessage): string {
	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("")
		.trim();
}

function isRealTitle(value: unknown): value is string {
	return (
		typeof value === "string" && value.length > 0 && value !== PLACEHOLDER_TITLE
	);
}

function createPendingImageAttachment(
	file: File,
	index: number,
	origin: "pasted" | "attached",
): ComposerAttachment {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const ext = imageExtension(file);
	const name = `${origin}-image-${timestamp}-${index + 1}.${ext}`;
	return {
		id: `att:pending:${timestamp}:${index + 1}`,
		path: "",
		relativePath: name,
		name,
		size: file.size,
		mimeType: file.type || `image/${ext}`,
		status: "pending" as const,
	};
}

registerShellularDiffThemes();

export interface ChatConversationPageProps {
	sessionId: string;
	agentId: AiBackend;
	workspacePath: string;
	title: string;
	assistantName: string;
	agentAvailable?: boolean;
	unavailableMessage?: string;
	providerName?: string;
	agentCapabilities?: Record<string, unknown>;
	cacheMessages?: boolean;
	createOnFirstMessage?: boolean;
	/**
	 * Stable local id for this chat in the per-folder chat cache (`chatTabs`).
	 * The chat self-registers under this id and updates its sessionId/title as
	 * they resolve, so the in-chat sidebar can list every chat in the folder.
	 * When omitted, the sidebar/cache integration is disabled.
	 */
	chatTabId?: string;
}

export default function ChatConversationPage({
	sessionId,
	agentId,
	workspacePath,
	title,
	assistantName,
	agentAvailable = true,
	unavailableMessage,
	providerName,
	createOnFirstMessage = false,
	chatTabId,
}: ChatConversationPageProps) {
	const { connectionStatus, hostDir, agents, loadAgents } = useShellular();
	const [showSidebar, setShowSidebar] = useState(false);
	// Host-cached config from this agent's last live session. A draft chat has no
	// session to ask, so this is what the toolbar renders until the first send
	// creates one and the real values arrive.
	const cachedAgentConfig = agents[agentId]?.sessionConfig;
	const resolvedWorkspacePath = useMemo(
		() => normalizeRemoteWorkspacePath(workspacePath, hostDir),
		[hostDir, workspacePath],
	);
	const [allMessages, setAllMessages] = useState<AcpMessage[]>([]);
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [scrollAdjust, setScrollAdjust] = useState(0);
	const [hasMoreRemote, setHasMoreRemote] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [activeSessionId, setActiveSessionId] = useState(sessionId);
	const [displayTitle, setDisplayTitle] = useState(() => {
		const activityTitle = getSessionActivity(agentId, sessionId)?.title;
		return isRealTitle(activityTitle) ? activityTitle : title;
	});
	const [isStreaming, setIsStreaming] = useState(() =>
		getSessionStreaming(agentId, sessionId),
	);
	const activeSessionIdRef = useRef(activeSessionId);
	useEffect(() => {
		activeSessionIdRef.current = activeSessionId;
	}, [activeSessionId]);
	const [composerParts, setComposerParts] = useState<ComposerPart[]>([]);
	const [imageAttachments, setImageAttachments] = useState<
		ComposerAttachment[]
	>([]);
	const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger>(null);
	const [fileSuggestions, setFileSuggestions] = useState<PromptSuggestion[]>(
		[],
	);
	const [error, setError] = useState("");
	const [configOptions, setConfigOptions] = useState<AiSessionConfigOption[]>(
		[],
	);
	const [availableCommands, setAvailableCommands] = useState<
		AcpAvailableCommand[]
	>([]);
	const [configSavingId, setConfigSavingId] = useState<string | null>(null);
	const [showConfigSheet, setShowConfigSheet] = useState(false);
	const [showContextSheet, setShowContextSheet] = useState(false);
	const [pendingPermissions, setPendingPermissions] = useState<
		AcpPermissionRequest[]
	>([]);
	const [pendingElicitations, setPendingElicitations] = useState<
		AcpElicitationRequest[]
	>([]);
	const [queuedPrompts, setQueuedPrompts] = useState<AcpQueuedPrompt[]>([]);
	const [editingQueuedPrompt, setEditingQueuedPrompt] =
		useState<AcpQueuedPrompt | null>(null);
	const [queueEditBusy, setQueueEditBusy] = useState(false);
	const [promptQueueRunning, setPromptQueueRunning] = useState(false);
	const [contextWindowUsage, setContextWindowUsage] =
		useState<ContextWindowUsage | null>(null);
	const [permissionScrollTick, setPermissionScrollTick] = useState(0);
	const [historyScrollReady, setHistoryScrollReady] = useState(false);
	const [activePromptSuggestionIndex, setActivePromptSuggestionIndex] =
		useState(0);
	// A queue runner can report `running` for one final event after its list has
	// drained. The active session state covers the item currently executing;
	// queue state only extends that while concrete pending items remain.
	const chatIsStreaming =
		isStreaming || (promptQueueRunning && queuedPrompts.length > 0);

	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const historyContentRef = useRef<HTMLDivElement>(null);
	const inputBarRef = useRef<HTMLDivElement>(null);
	const promptInputRef = useRef<HTMLDivElement>(null);
	const connectionStatusRef = useRef(connectionStatus);
	useEffect(() => {
		connectionStatusRef.current = connectionStatus;
	}, [connectionStatus]);
	const stickToBottomRef = useRef(true);
	const prevScrollHeightRef = useRef(0);
	const autoScrollFrameRef = useRef(0);
	const autoScrollSuppressedRef = useRef(false);
	const autoScrollSuppressionCountRef = useRef(0);
	// True while the user has text selected inside the transcript. Prepending
	// older messages or pinning to the bottom mid-selection tears the selection
	// off its anchor, which on Android reads as the selection "jumping" to the
	// top of the conversation.
	const selectionActiveRef = useRef(false);
	const cleanupRef = useRef<(() => void) | null>(null);
	const cleanupSendRef = useRef<(() => void) | null>(null);
	const attachedSessionIdRef = useRef<string | null>(null);
	const attachedRevisionRef = useRef(0);
	const attachReadyRef = useRef(false);
	const pendingAttachEventsRef = useRef<AcpSessionEvent[]>([]);
	const createSessionPromiseRef = useRef<Promise<{
		sessionId: string;
		configOptions: AiSessionConfigOption[];
		availableCommands: AcpAvailableCommand[];
		messages: AcpMessage[];
		revision: number;
		syncing?: boolean;
	}> | null>(null);
	// Identifies this chat's unsent draft. Keyed on the session once there is
	// one, so the draft follows the conversation whichever way it is reopened.
	// Before that, on agent+folder rather than chatTabId — opening a new chat
	// mints a fresh random chatTabId (see lib/chatTabId), so keying on it would
	// lose the draft on exactly the back-out-and-reopen it needs to survive.
	// Only one unsent new chat exists per agent+folder, so it can't collide.
	const liveSessionId = sessionId || activeSessionId;
	const draftKey = liveSessionId
		? `chat-draft:${agentId}:${liveSessionId}`
		: `chat-draft:new:${agentId}:${workspacePath}`;
	const [reviewComments, setReviewComments] = useState<GitReviewComment[]>(() =>
		(reviewCommentDrafts.get(draftKey) ?? []).map((comment) => ({
			...comment,
		})),
	);
	// Config picks made in a draft chat, before any session existed to send them
	// to. Replayed onto the real session right after it is created, keyed by
	// option id so the last pick for an option wins.
	const pendingConfigChangesRef = useRef(
		new Map<
			string,
			{ option: AiSessionConfigOption; value: string | boolean }
		>(),
	);
	const queuedEditComposerBackupRef = useRef<{
		parts: ComposerPart[];
		imageAttachments: ComposerAttachment[];
	} | null>(null);
	// Tail of the current turn: the newest assistant message seen. Read-only
	// bookkeeping — incoming messages never overwrite it.
	const streamingAssistantIdRef = useRef<string | null>(null);
	const streamingUserIdRef = useRef<string | null>(null);
	// Direct prompts also pass through the CLI's queue internally. Track the one
	// the idle runner is about to claim so it is not presented as waiting work.
	const directPromptDispatchRef = useRef<DirectPromptDispatch | null>(null);
	const immediatelyClaimedPromptIdsRef = useRef(new Set<string>());
	// Protocol message timestamps are optional, so retain the locally measured
	// wall-clock duration for turns completed during this page lifetime.
	const [turnDurationByUserId, setTurnDurationByUserId] = useState<
		Record<string, number>
	>({});
	// Cumulative token text per streaming message id, so a token is rendered
	// only as the suffix beyond what the last `message` event already carried.
	const streamedTextRef = useRef(new Map<string, string>());
	const sentTurnStartRef = useRef(0);
	const ownerRecoveryRef = useRef<{
		sessionId: string;
		userMessageId: string;
		parts: ComposerPart[];
		imageAttachments: ComposerAttachment[];
	} | null>(null);
	const ownerRetryRef = useRef<(() => void) | null>(null);
	const ownerDialogOpenRef = useRef(false);
	const allMessagesLengthRef = useRef(0);
	const upsertAcpMessageRef = useRef<(msg: AcpMessage) => void>(() => {});
	// Transcript index of allMessages[0] on the CLI, and the transcript
	// generation those indices belong to. Pages from a different generation are
	// stale (a full reload replaced history) and must be discarded.
	const remoteBaseIdxRef = useRef(0);
	const remoteGenerationRef = useRef<number | undefined>(undefined);
	// Agent metadata is loaded on connection, but an existing chat can populate
	// the CLI's config cache later. Refresh once for this draft so it sees that
	// cache before lazily creating an ACP session on the first send.
	const draftConfigRefreshRef = useRef<string | null>(null);

	useEffect(() => {
		if (reviewComments.length) {
			reviewCommentDrafts.set(draftKey, reviewComments);
		} else {
			reviewCommentDrafts.delete(draftKey);
		}
	}, [draftKey, reviewComments]);

	const visibleMessages = useMemo(
		() => allMessages.slice(-Math.min(visibleCount, allMessages.length)),
		[allMessages, visibleCount],
	);
	const visibleMessageItems = useMemo(() => {
		const seen = new Map<string, number>();
		const items: Array<{
			message: AcpMessage;
			messageKey: string;
			renderKey: string;
			groupEnd: boolean;
			groupParts: AcpMessagePart[];
			parts: AcpMessagePart[];
			workParts: AcpMessagePart[];
			workStartedAt?: number;
			workDurationMs?: number;
		}> = [];
		for (let index = 0; index < visibleMessages.length; index += 1) {
			const message = visibleMessages[index];
			if (message.role === "assistant") {
				let end = index + 1;
				while (
					end < visibleMessages.length &&
					visibleMessages[end].role === "assistant"
				) {
					end += 1;
				}
				const turnMessages = visibleMessages.slice(index, end);
				const liveTurn = chatIsStreaming && end === visibleMessages.length;
				const projection = projectAssistantTurn(turnMessages, liveTurn);
				const messageKey = getMessageKey(turnMessages[0]);
				const count = seen.get(messageKey) ?? 0;
				seen.set(messageKey, count + 1);
				const previousMessage = visibleMessages[index - 1];
				const recordedDuration = previousMessage?.id
					? turnDurationByUserId[previousMessage.id]
					: undefined;
				items.push({
					message: turnMessages[turnMessages.length - 1] ?? message,
					messageKey,
					renderKey:
						count === 0
							? `assistant-turn:${messageKey}`
							: `assistant-turn:${messageKey}:duplicate-${count}`,
					groupEnd: true,
					groupParts: projection.answerParts,
					parts: projection.answerParts,
					workParts: projection.workParts,
					workStartedAt:
						previousMessage?.timestamp ?? turnMessages[0]?.timestamp,
					workDurationMs:
						recordedDuration ??
						getAssistantTurnDurationMs(turnMessages, previousMessage),
				});
				index = end - 1;
				continue;
			}

			const messageKey = getMessageKey(message);
			const count = seen.get(messageKey) ?? 0;
			seen.set(messageKey, count + 1);
			// Consecutive user messages remain separate bubbles but share one
			// group-closing action row, so queued/echoed messages copy together.
			const next = visibleMessages[index + 1];
			const groupEnd = !next || next.role !== message.role;
			let groupParts = message.parts;
			if (groupEnd) {
				let start = index;
				while (start > 0 && visibleMessages[start - 1].role === message.role) {
					start -= 1;
				}
				if (start < index) {
					groupParts = visibleMessages
						.slice(start, index + 1)
						.flatMap((item) => item.parts);
				}
			}
			items.push({
				message,
				messageKey,
				groupEnd,
				groupParts,
				parts: message.parts,
				workParts: [],
				renderKey:
					count === 0 ? messageKey : `${messageKey}:duplicate-${count}`,
			});
		}
		return items;
	}, [chatIsStreaming, turnDurationByUserId, visibleMessages]);
	const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];

	// What the agent is doing right now, read off the newest unfinished tool
	// call in the streaming message. Falls back to "thinking" when it's just
	// generating text.
	const streamingStatusLabel = useMemo(() => {
		if (!chatIsStreaming || lastVisibleMessage?.role !== "assistant") {
			return undefined;
		}
		for (let index = lastVisibleMessage.parts.length - 1; index >= 0; index--) {
			const part = lastVisibleMessage.parts[index];
			if (part.type !== "tool_call") continue;
			const status = (part as { status?: unknown }).status;
			if (status === "completed" || status === "failed" || status === "fail") {
				continue;
			}
			const title = (part as { title?: unknown }).title;
			if (typeof title === "string" && title.trim()) return title.trim();
			const name = (part as { name?: unknown }).name;
			if (typeof name === "string" && name.trim()) {
				return `running ${name.trim()}`;
			}
			return undefined;
		}
		return undefined;
	}, [chatIsStreaming, lastVisibleMessage]);

	useEffect(() => {
		allMessagesLengthRef.current = allMessages.length;
	}, [allMessages.length]);

	const hasMore = allMessages.length > visibleCount || hasMoreRemote;
	const promptSuggestions = useMemo(
		() =>
			composerTrigger?.trigger === "/"
				? getPromptSuggestions(composerTrigger.query, availableCommands)
				: composerTrigger?.trigger === "@"
					? fileSuggestions
					: [],
		[availableCommands, composerTrigger, fileSuggestions],
	);
	const hasSendableContent = useMemo(
		() =>
			composerParts.some(
				(part) => part.type === "attachment" || part.text.trim().length > 0,
			) ||
			imageAttachments.length > 0 ||
			reviewComments.length > 0,
		[composerParts, imageAttachments, reviewComments.length],
	);
	const attachmentsUploading = useMemo(
		() =>
			composerParts.some(
				(part) =>
					part.type === "attachment" && part.attachment.status === "pending",
			) ||
			imageAttachments.some((attachment) => attachment.status === "pending"),
		[composerParts, imageAttachments],
	);
	const attachmentsFailed = useMemo(
		() =>
			composerParts.some(
				(part) =>
					part.type === "attachment" && part.attachment.status === "error",
			) || imageAttachments.some((attachment) => attachment.status === "error"),
		[composerParts, imageAttachments],
	);
	const canSendPrompt =
		hasSendableContent && !attachmentsUploading && !attachmentsFailed;
	// When the send button is disabled, tapping it should explain why rather than
	// feeling broken. Ordered most-specific first; an empty composer returns null
	// (nothing to say — the empty state is self-evident).
	const sendBlockedReason = useMemo(() => {
		if (!agentAvailable) return unavailableMessage ?? null;
		if (connectionStatus !== "connected") return "Not connected to host";
		if (syncing) return "Still loading this chat…";
		if (attachmentsUploading) return "Hang on — an image is still uploading";
		if (attachmentsFailed)
			return "An image failed to upload. Remove it and try again";
		return null;
	}, [
		agentAvailable,
		attachmentsFailed,
		attachmentsUploading,
		connectionStatus,
		syncing,
		unavailableMessage,
	]);
	const contextMeter = useMemo(
		() =>
			contextWindowUsage ? (
				<ContextWindowMeter
					usedTokens={contextWindowUsage.usedTokens}
					maxTokens={contextWindowUsage.maxTokens}
					onClick={() => setShowContextSheet(true)}
				/>
			) : null,
		[contextWindowUsage],
	);

	const startAutoScrollSuppression = useCallback(() => {
		autoScrollSuppressionCountRef.current += 1;
		autoScrollSuppressedRef.current = autoScrollSuppressionCountRef.current > 0;
		if (autoScrollFrameRef.current) {
			cancelAnimationFrame(autoScrollFrameRef.current);
			autoScrollFrameRef.current = 0;
		}
	}, []);

	const endAutoScrollSuppression = useCallback(() => {
		autoScrollSuppressionCountRef.current = Math.max(
			0,
			autoScrollSuppressionCountRef.current - 1,
		);
		autoScrollSuppressedRef.current = autoScrollSuppressionCountRef.current > 0;
	}, []);

	const scrollToBottomNow = useCallback((force = false) => {
		// Never yank the viewport out from under an active selection, even for a
		// forced scroll — the user is reading, not waiting on new output.
		if (selectionActiveRef.current) return;
		if (!force && autoScrollSuppressedRef.current) return;
		if (force) autoScrollSuppressedRef.current = false;
		const container = scrollRef.current;
		if (!container) return;
		container.scrollTop = Math.max(
			0,
			container.scrollHeight - container.clientHeight,
		);
	}, []);

	const scrollToBottom = useCallback(
		(force = false) => {
			if (autoScrollFrameRef.current) return;
			autoScrollFrameRef.current = requestAnimationFrame(() => {
				autoScrollFrameRef.current = 0;
				scrollToBottomNow(force);
			});
		},
		[scrollToBottomNow],
	);

	const triggerLoadMore = useCallback(() => {
		if (!historyScrollReady || !hasMore || loadingMore || !scrollRef.current) {
			return;
		}
		// Loading older messages prepends content and corrects scrollTop to keep
		// the view steady. Doing that mid-selection rips the selection away from
		// where the user is dragging, so hold off — the sentinel is still in view
		// when they finish, and the observer fires again on the next scroll.
		if (selectionActiveRef.current) return;
		// Reveal already-loaded messages first; only hit the network once the
		// local array is exhausted.
		if (allMessagesLengthRef.current > visibleCount) {
			prevScrollHeightRef.current = scrollRef.current.scrollHeight;
			setLoadingMore(true);
			setVisibleCount((c) => c + PAGE_SIZE);
			setScrollAdjust((n) => n + 1);
			return;
		}
		if (!hasMoreRemote || remoteBaseIdxRef.current <= 0) {
			setHasMoreRemote(false);
			return;
		}
		const targetSessionId = activeSessionId || sessionId;
		const requestGeneration = remoteGenerationRef.current;
		setLoadingMore(true);
		acpMessagesPage(agentId, targetSessionId, remoteBaseIdxRef.current)
			.then((page) => {
				// A reload replaced the transcript mid-flight; its session.snapshot
				// already reset our window, so this page's indices are meaningless.
				if (
					page.generation !== undefined &&
					page.generation !== requestGeneration
				) {
					setLoadingMore(false);
					return;
				}
				// An empty window carries no bounds. `hasMoreBefore` is the only
				// signal here — it cannot be derived from an absent `from`.
				if (page.from === undefined || page.messages.length === 0) {
					setHasMoreRemote(page.hasMoreBefore === true);
					setLoadingMore(false);
					return;
				}
				if (scrollRef.current) {
					prevScrollHeightRef.current = scrollRef.current.scrollHeight;
				}
				// Next page back ends where this one begins.
				remoteBaseIdxRef.current = page.from;
				setHasMoreRemote(page.hasMoreBefore === true);
				setAllMessages((prev) => [...page.messages, ...prev]);
				setVisibleCount((c) => c + page.messages.length);
				setScrollAdjust((n) => n + 1);
			})
			.catch((err) => {
				// A failed page read is a real failure (e.g. an unreadable
				// transcript store), not "no more history" — surface it instead of
				// silently capping scroll-back. hasMoreRemote stays set so the
				// sentinel retries on the next nudge.
				setError(getErrorMessage(err, "Failed to load older messages"));
				setLoadingMore(false);
			});
	}, [
		activeSessionId,
		agentId,
		hasMore,
		hasMoreRemote,
		historyScrollReady,
		loadingMore,
		sessionId,
		visibleCount,
	]);

	const handleSessionStatus = useCallback(
		(properties: Record<string, unknown>) => {
			const nextUsage = readContextWindowUsage(properties);
			if (nextUsage) setContextWindowUsage(nextUsage);
			const nextOptions =
				readConfigOptions(properties.configOptions) ??
				readConfigOptions(
					(properties.status as { configOptions?: unknown })?.configOptions,
				);
			if (nextOptions) setConfigOptions(nextOptions);
			const nextCommands = readAvailableCommands(properties.availableCommands);
			if (nextCommands) setAvailableCommands(nextCommands);
		},
		[],
	);

	const handlePermissionRequest = useCallback(
		(permission: AcpPermissionRequest) => {
			// A permission with no actionable options is a resolution/withdrawal
			// signal, not a request — the CLI re-emits the permission with an empty
			// options list once it has been answered elsewhere or cancelled. Rendering
			// it would produce a dead, button-less card the user can't dismiss, so
			// treat it as a removal of any existing card for this id instead.
			const hasActionableOptions =
				Array.isArray(permission.options) &&
				permission.options.some(
					(option) =>
						option != null &&
						typeof option === "object" &&
						typeof (option as { optionId?: unknown }).optionId === "string",
				);
			if (!hasActionableOptions) {
				setPendingPermissions((prev) =>
					prev.filter((item) => item.id !== permission.id),
				);
				return;
			}
			setPendingPermissions((prev) => {
				const existing = prev.findIndex((item) => item.id === permission.id);
				if (existing >= 0) {
					const next = [...prev];
					next[existing] = permission;
					return next;
				}
				return [...prev, permission];
			});
			setPermissionScrollTick((tick) => tick + 1);
		},
		[],
	);

	const appendStreamToken = useCallback((itemId: string, text: string) => {
		// Total text the token stream has delivered for this message so far. The
		// message itself may already contain some of it via a `message` event.
		const streamedText = (streamedTextRef.current.get(itemId) ?? "") + text;
		streamedTextRef.current.set(itemId, streamedText);
		setAllMessages((prev) => {
			const index = prev.findIndex((message) => message.id === itemId);
			// No bubble yet: the message event that creates it carries this text.
			if (index < 0) return prev;
			const message = prev[index];
			const suffix = pendingTokenSuffix(message, streamedText);
			if (!suffix) return prev;
			const next = [...prev];
			next[index] = { ...message, parts: appendTextPart(message, suffix) };
			return next;
		});
	}, []);

	const handleSessionOwnerErrorRef = useRef<
		(details: AcpPromptError) => Promise<void>
	>(() => Promise.resolve());
	const appendStopReasonRef = useRef<(stopReason: string) => void>(() => {});
	const finishStreamingTurnRef = useRef<(sessionId?: string) => void>(() => {});

	const processSessionEvent = useCallback(
		(event: AcpSessionEvent) => {
			if (event.type === "permission.updated") {
				const permission = readPendingActivityPermission(event.properties);
				if (permission) handlePermissionRequest(permission);
				return;
			}

			if (event.type === "elicitation.updated") {
				const properties = event.properties as Record<string, unknown>;
				if (properties.resolved === true) {
					const id = properties.id;
					if (typeof id === "string") {
						setPendingElicitations((prev) =>
							prev.filter((item) => item.id !== id),
						);
					}
					return;
				}
				const request = readElicitationRequest(properties);
				if (request) {
					setPendingElicitations((prev) => [
						...prev.filter((item) => item.id !== request.id),
						request,
					]);
				}
				return;
			}

			if (event.type === "token") {
				// Streaming text deltas. Full `message` events are coalesced CLI-side
				// (they carry the whole message and are quadratic on the wire), so
				// tokens do the smooth per-chunk rendering in between.
				//
				// A `message` event carries the message's CUMULATIVE text, including
				// every token already rendered. Appending each token blindly therefore
				// double-renders it for as long as the next message event is coalesced
				// away. Tokens are instead buffered per message and applied as the
				// suffix beyond whatever the last message event delivered.
				const itemId = event.properties.itemId;
				const text = event.properties.text;
				if (typeof itemId === "string" && typeof text === "string" && text) {
					appendStreamToken(itemId, text);
				}
				return;
			}

			if (event.type === "session.status") {
				if (event.properties.syncing === "messages") {
					setSyncing(true);
				} else if (event.properties.syncing === false) {
					setSyncing(false);
				}
				handleSessionStatus(event.properties as Record<string, unknown>);
				return;
			}

			if (event.type === "prompt_queue.updated") {
				const queue = Array.isArray(event.properties.queue)
					? (event.properties.queue as AcpQueuedPrompt[])
					: [];
				const running = event.properties.running === true;
				const visibility = reconcilePromptQueueVisibility(
					queue,
					running,
					directPromptDispatchRef.current,
					immediatelyClaimedPromptIdsRef.current,
				);
				directPromptDispatchRef.current = visibility.directDispatch;
				immediatelyClaimedPromptIdsRef.current =
					visibility.immediatelyClaimedIds;
				setPromptQueueRunning(running);
				setQueuedPrompts(visibility.visibleItems);
				return;
			}

			if (event.type === "session.snapshot") {
				const messages = event.properties.messages;
				if (Array.isArray(messages)) {
					const from = event.properties.from;
					const generation = event.properties.generation;
					const hasMoreBefore = event.properties.hasMoreBefore;
					remoteBaseIdxRef.current = typeof from === "number" ? from : 0;
					remoteGenerationRef.current =
						typeof generation === "number" ? generation : undefined;
					setHasMoreRemote(hasMoreBefore === true);
					// Authoritative transcript replacement: any buffered token text is
					// already included, so accumulators must not replay on top of it.
					streamedTextRef.current.clear();
					setAllMessages(messages as AcpMessage[]);
					setVisibleCount(PAGE_SIZE);
					stickToBottomRef.current = true;
					requestAnimationFrame(() => scrollToBottomNow(true));
				}
				const state = event.properties.state;
				if (state && typeof state === "object") {
					const nextOptions = readConfigOptions(
						(state as { configOptions?: unknown }).configOptions,
					);
					if (nextOptions) setConfigOptions(nextOptions);
					const nextCommands = readAvailableCommands(
						(state as { availableCommands?: unknown }).availableCommands,
					);
					if (nextCommands) setAvailableCommands(nextCommands);
				}
				setLoading(false);
				setSyncing(false);
				return;
			}

			if (event.type === "message") {
				const message = event.properties.message;
				const acpMessage = message as AcpMessage | undefined;
				// Queued sends produce a transient `prompt_queue_*` user message
				// before ACP dispatches the prompt. The queue strip owns that state;
				// rendering it here creates a duplicate user bubble during the
				// preceding turn. The later, authoritative ACP message is not a
				// placeholder and is rendered normally.
				if (acpMessage && !isQueuedPromptPlaceholderId(acpMessage.id)) {
					upsertAcpMessageRef.current(acpMessage);
				}
				return;
			}

			if (event.type === "error" || event.type === "prompt_error") {
				finishStreamingTurnRef.current();
				const ownerError = readSessionOwnerError(event.properties);
				if (ownerError) {
					void handleSessionOwnerErrorRef.current(ownerError);
					return;
				}
				setError(String(event.properties.error ?? "Prompt failed"));
				return;
			}

			if (event.type === "end" || event.type === "cancelled") {
				const usage = (event.properties as { usage?: unknown }).usage;
				if (usage && typeof usage === "object" && !Array.isArray(usage)) {
					const nextUsage = readContextWindowUsage({ usage });
					if (nextUsage) setContextWindowUsage(nextUsage);
				}
				const stopReason = (event.properties as { stopReason?: unknown })
					.stopReason;
				if (
					typeof stopReason === "string" &&
					shouldShowStopReason(stopReason)
				) {
					appendStopReasonRef.current(stopReason);
				}
				finishStreamingTurnRef.current();
			}
		},
		[
			appendStreamToken,
			handlePermissionRequest,
			handleSessionStatus,
			scrollToBottomNow,
		],
	);

	const handleElicitationReply = useCallback(
		(
			elicitation: AcpElicitationRequest,
			action: "accept" | "decline" | "cancel",
			content?: Record<string, unknown>,
		) => {
			acpElicitationReply(
				agentId,
				elicitation.sessionId,
				elicitation.id,
				action,
				content,
			);
			setPendingElicitations((prev) =>
				prev.filter((item) => item.id !== elicitation.id),
			);
		},
		[agentId],
	);

	const applyRevisionedSessionEvent = useCallback(
		(event: AcpSessionEvent) => {
			if (!attachReadyRef.current) {
				pendingAttachEventsRef.current.push(event);
				return;
			}

			const revision = event.revision ?? 0;
			if (revision > 0) {
				if (revision <= attachedRevisionRef.current) return;
				attachedRevisionRef.current = revision;
			}

			processSessionEvent(event);
		},
		[processSessionEvent],
	);

	const updateInputOffset = useCallback(() => {
		const inputBar = inputBarRef.current;
		const container = scrollRef.current;
		if (!inputBar || !container) return;
		container.style.setProperty(
			"--chat-input-offset",
			`${Math.ceil(inputBar.getBoundingClientRect().height) + 50}px`,
		);
		if (stickToBottomRef.current) scrollToBottomNow();
	}, [scrollToBottomNow]);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		const container = scrollRef.current;
		if (!sentinel || !container || !hasMore || !historyScrollReady) return;
		const handleClick = (event: MouseEvent) =>
			handleFiles(event, resolvedWorkspacePath);

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) triggerLoadMore();
			},
			{ root: container, rootMargin: "300px 0px 0px 0px" },
		);
		observer.observe(sentinel);
		container.addEventListener("click", handleClick);
		return () => {
			observer.disconnect();
			container.removeEventListener("click", handleClick);
		};
	}, [hasMore, historyScrollReady, resolvedWorkspacePath, triggerLoadMore]);

	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;
		const handleClick = (event: MouseEvent) =>
			handleFiles(event, resolvedWorkspacePath);
		container.addEventListener("click", handleClick);
		return () => {
			container.removeEventListener("click", handleClick);
		};
	}, [resolvedWorkspacePath]);

	useEffect(() => {
		if (composerTrigger?.trigger !== "@" || !resolvedWorkspacePath) {
			setFileSuggestions([]);
			return;
		}

		let cancelled = false;
		const query = composerTrigger.query.trim();
		const timer = window.setTimeout(() => {
			const suggestionsPromise = query
				? searchProjectFiles(resolvedWorkspacePath, query, { limit: 8 }).then(
						(result) => result.entries.map(fileSuggestionFromSearchEntry),
					)
				: listDir(resolvedWorkspacePath).then((entries) =>
						entries
							.slice(0, 8)
							.map((entry) =>
								fileSuggestionFromDirectoryEntry(entry, resolvedWorkspacePath),
							),
					);

			suggestionsPromise
				.then((result) => {
					if (cancelled) return;
					setFileSuggestions(result);
				})
				.catch(() => {
					if (!cancelled) setFileSuggestions([]);
				});
		}, 120);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [composerTrigger, resolvedWorkspacePath]);

	useEffect(() => {
		setActiveSessionId(sessionId);
		stickToBottomRef.current = true;
		streamedTextRef.current.clear();
		directPromptDispatchRef.current = null;
		immediatelyClaimedPromptIdsRef.current.clear();
		setPendingPermissions([]);
		setPendingElicitations([]);
		setQueuedPrompts([]);
		setPromptQueueRunning(false);
		setHistoryScrollReady(false);
	}, [sessionId]);

	useEffect(() => {
		if (
			connectionStatus !== "connected" ||
			!createOnFirstMessage ||
			sessionId ||
			draftConfigRefreshRef.current === agentId
		) {
			return;
		}
		draftConfigRefreshRef.current = agentId;
		void loadAgents();
	}, [agentId, connectionStatus, createOnFirstMessage, loadAgents, sessionId]);

	useEffect(() => {
		if (connectionStatus !== "connected") return;
		// A draft chat has no session yet, and deliberately does not create one:
		// the agent session is spawned lazily by the first send (see handleSend),
		// so opening a new chat and backing out costs nothing on the host. There
		// is nothing to attach to or load here — just show an empty, ready
		// composer.
		if (createOnFirstMessage && !activeSessionId) {
			setAllMessages([]);
			setVisibleCount(PAGE_SIZE);
			stickToBottomRef.current = true;
			setHistoryScrollReady(true);
			if (!pendingConfigChangesRef.current.size) {
				setConfigOptions(cachedAgentConfig?.configOptions ?? []);
			}
			setAvailableCommands(cachedAgentConfig?.availableCommands ?? []);
			setContextWindowUsage(null);
			setHasMoreRemote(false);
			setLoading(false);
			setSyncing(false);
			return;
		}

		// After a lazy create, the live session lives in activeSessionId while the
		// `sessionId` prop is still "". handleSend has already attached and
		// subscribed to it, so re-attaching here would double-subscribe and replay
		// the turn that is streaming right now.
		const targetSessionId = sessionId || activeSessionId;
		if (!targetSessionId) return;
		if (attachedSessionIdRef.current === targetSessionId) return;

		const hasVisibleMessages = allMessagesLengthRef.current > 0;
		setLoading(!hasVisibleMessages);
		setSyncing(hasVisibleMessages);
		setVisibleCount(PAGE_SIZE);
		setContextWindowUsage(null);
		stickToBottomRef.current = true;
		setHistoryScrollReady(false);
		attachReadyRef.current = false;
		attachedSessionIdRef.current = null;
		attachedRevisionRef.current = 0;
		pendingAttachEventsRef.current = [];
		remoteBaseIdxRef.current = 0;
		remoteGenerationRef.current = undefined;
		setHasMoreRemote(false);

		let cancelled = false;
		cleanupRef.current = acpSubscribeSessionEvents(
			agentId,
			targetSessionId,
			applyRevisionedSessionEvent,
		);

		acpAttachSession(agentId, targetSessionId, resolvedWorkspacePath || ".")
			.then((result) => {
				if (cancelled) return;
				setConfigOptions(result.configOptions);
				setAvailableCommands(result.availableCommands);
				setAllMessages(result.messages);
				remoteBaseIdxRef.current = result.from ?? 0;
				remoteGenerationRef.current = result.generation;
				setHasMoreRemote(result.hasMoreBefore === true);
				attachedSessionIdRef.current = targetSessionId;
				attachedRevisionRef.current = result.revision;
				attachReadyRef.current = true;
				setSyncing(Boolean(result.syncing));
				if (getSessionStreaming(agentId, targetSessionId)) {
					const lastUser = findLast(result.messages, (m) => m.role === "user");
					const lastAssistant = findLast(
						result.messages,
						(m) => m.role === "assistant",
					);
					streamingUserIdRef.current = lastUser?.id ?? null;
					streamingAssistantIdRef.current = lastAssistant?.id ?? null;
					sentTurnStartRef.current = lastUser?.timestamp ?? 0;
				}
				const buffered = pendingAttachEventsRef.current
					.splice(0)
					.sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
				for (const event of buffered) {
					applyRevisionedSessionEvent(event);
				}
				setLoading(false);
				setSyncing(false);
			})
			.catch((err) => {
				if (!cancelled) {
					setError(getErrorMessage(err));
					setLoading(false);
					setSyncing(false);
				}
			});

		return () => {
			cancelled = true;
			const attachedSessionId = attachedSessionIdRef.current;
			if (attachedSessionId && connectionStatusRef.current === "connected") {
				void acpDetachSession(agentId, attachedSessionId).catch(() => {});
			}
			cleanupRef.current?.();
			cleanupRef.current = null;
			attachReadyRef.current = false;
			attachedSessionIdRef.current = null;
			pendingAttachEventsRef.current = [];
			setLoading(false);
		};
	}, [
		agentId,
		activeSessionId,
		cachedAgentConfig,
		connectionStatus,
		createOnFirstMessage,
		applyRevisionedSessionEvent,
		sessionId,
		resolvedWorkspacePath,
	]);

	// Scroll to bottom after React commits new messages or streaming tokens
	// biome-ignore lint/correctness/useExhaustiveDependencies: allMessages/streamingText are used as change triggers
	useEffect(() => {
		if (stickToBottomRef.current) scrollToBottom();
	}, [allMessages, scrollToBottom]);

	useLayoutEffect(() => {
		if (permissionScrollTick === 0) return;
		stickToBottomRef.current = true;
		scrollToBottomNow(true);
		const frame = requestAnimationFrame(() => {
			scrollToBottomNow(true);
		});
		return () => cancelAnimationFrame(frame);
	}, [permissionScrollTick, scrollToBottomNow]);

	// Pull the composer's live DOM into React state. The composer is
	// contenteditable, so the DOM is the source of truth and state has to be
	// re-read after anything mutates it — typing, pasting, or restoring a draft.
	const syncComposerState = useCallback(() => {
		const input = promptInputRef.current;
		setComposerParts(readComposerParts(input));
		setComposerTrigger(findComposerTrigger(input));
		setActivePromptSuggestionIndex(0);
	}, []);

	// Put an unsent draft back whenever the composer has lost it: React owns this
	// subtree and rebuilds it on remount (reconnect, resume, back-and-return).
	// Runs after every commit rather than keying off `loading` — a draft chat
	// never toggles that flag, which is why new chats lost their prompt while
	// existing ones kept it. useLayoutEffect so the text is back before paint.
	useLayoutEffect(() => {
		if (!restoreComposerDraft(draftKey, promptInputRef.current)) return;
		// Restored content has to land in state the same way typing would.
		syncComposerState();
	});

	useEffect(() => {
		const content = historyContentRef.current;
		if (!content) return;

		let frame = 0;
		let lastHeight = 0;
		const pinToBottom = () => {
			frame = 0;
			if (stickToBottomRef.current && !loadingMore) scrollToBottomNow();
		};
		const observer = new ResizeObserver((entries) => {
			if (!entries.length) return;
			const height = entries[0].contentRect.height;
			if (height === lastHeight) return;
			lastHeight = height;
			if (frame) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(pinToBottom);
		});

		observer.observe(content);
		return () => {
			if (frame) cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, [loadingMore, scrollToBottomNow]);

	useEffect(() => {
		const inputBar = inputBarRef.current;
		const container = scrollRef.current;
		if (!inputBar || !container) return;

		const initialFrame = requestAnimationFrame(updateInputOffset);
		let observerFrame = 0;
		let lastInputHeight = 0;
		const observer = new ResizeObserver((entries) => {
			if (!entries.length) return;
			const height = entries[0].contentRect.height;
			if (height === lastInputHeight) return;
			lastInputHeight = height;
			if (observerFrame) cancelAnimationFrame(observerFrame);
			observerFrame = requestAnimationFrame(updateInputOffset);
		});
		observer.observe(inputBar);
		return () => {
			cancelAnimationFrame(initialFrame);
			if (observerFrame) cancelAnimationFrame(observerFrame);
			observer.disconnect();
		};
	}, [updateInputOffset]);

	useLayoutEffect(() => {
		if (loading || createOnFirstMessage || historyScrollReady) return;
		if (allMessages.length === 0) {
			setHistoryScrollReady(true);
			return;
		}
		stickToBottomRef.current = true;
		scrollToBottomNow(true);
		setHistoryScrollReady(true);
		const frame = requestAnimationFrame(() => {
			scrollToBottomNow(true);
		});
		return () => cancelAnimationFrame(frame);
	}, [
		allMessages.length,
		createOnFirstMessage,
		historyScrollReady,
		loading,
		scrollToBottomNow,
	]);

	useEffect(() => {
		const onKeyboardShow = () => {
			if (stickToBottomRef.current) scrollToBottom();
		};
		keyboard.on("show", onKeyboardShow);
		return () => keyboard.off("show", onKeyboardShow);
	}, [scrollToBottom]);

	useEffect(() => {
		const getDistanceFromBottom = () => {
			if (!scrollRef.current) return 0;
			const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
			return scrollHeight - scrollTop - clientHeight;
		};
		const handleScroll = () => {
			// A selection drag auto-scrolls the WebView; that is the selection
			// moving, not the user asking to follow new output, so it must not
			// re-arm stick-to-bottom.
			if (selectionActiveRef.current) return;
			const distanceFromBottom = getDistanceFromBottom();
			stickToBottomRef.current = distanceFromBottom < 100;
		};
		const handleUserScrollIntent = () => {
			const distanceFromBottom = getDistanceFromBottom();
			if (distanceFromBottom >= 24) {
				stickToBottomRef.current = false;
				if (autoScrollFrameRef.current) {
					cancelAnimationFrame(autoScrollFrameRef.current);
					autoScrollFrameRef.current = 0;
				}
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === "ArrowUp" ||
				event.key === "PageUp" ||
				event.key === "Home" ||
				event.key === " "
			) {
				handleUserScrollIntent();
			}
		};
		const handleDisclosureAnimationStart = () => {
			startAutoScrollSuppression();
			stickToBottomRef.current = false;
		};
		const handleDisclosureAnimationEnd = () => {
			endAutoScrollSuppression();
		};
		// Track selection at the document level: on Android the drag is driven by
		// the WebView's own selection handles, which emit no pointer events we
		// could hook on the container.
		const handleSelectionChange = () => {
			const selection = document.getSelection();
			const container = scrollRef.current;
			selectionActiveRef.current = Boolean(
				selection &&
					!selection.isCollapsed &&
					selection.rangeCount > 0 &&
					container?.contains(selection.getRangeAt(0).commonAncestorContainer),
			);
		};
		document.addEventListener("selectionchange", handleSelectionChange);
		const container = scrollRef.current;
		if (container) {
			container.addEventListener("scroll", handleScroll);
			container.addEventListener("wheel", handleUserScrollIntent, {
				passive: true,
			});
			container.addEventListener("touchmove", handleUserScrollIntent, {
				passive: true,
			});
			container.addEventListener("keydown", handleKeyDown);
			container.addEventListener(
				"chat-disclosure-animation-start",
				handleDisclosureAnimationStart,
			);
			container.addEventListener(
				"chat-disclosure-animation-end",
				handleDisclosureAnimationEnd,
			);
		}
		return () => {
			cleanupSendRef.current?.();
			document.removeEventListener("selectionchange", handleSelectionChange);
			container?.removeEventListener("scroll", handleScroll);
			container?.removeEventListener("wheel", handleUserScrollIntent);
			container?.removeEventListener("touchmove", handleUserScrollIntent);
			container?.removeEventListener("keydown", handleKeyDown);
			container?.removeEventListener(
				"chat-disclosure-animation-start",
				handleDisclosureAnimationStart,
			);
			container?.removeEventListener(
				"chat-disclosure-animation-end",
				handleDisclosureAnimationEnd,
			);
			if (autoScrollFrameRef.current) {
				cancelAnimationFrame(autoScrollFrameRef.current);
				autoScrollFrameRef.current = 0;
			}
		};
	}, [endAutoScrollSuppression, startAutoScrollSuppression]);

	useLayoutEffect(() => {
		if (scrollAdjust > 0 && scrollRef.current) {
			scrollRef.current.scrollTop +=
				scrollRef.current.scrollHeight - prevScrollHeightRef.current;
			setLoadingMore(false);
		}
	}, [scrollAdjust]);

	useEffect(() => {
		const refreshActivity = () => {
			const targetSessionId = activeSessionId || sessionId;
			if (!targetSessionId) {
				setIsStreaming(false);
				return;
			}
			setIsStreaming(getSessionStreaming(agentId, targetSessionId));
			const activity = getSessionActivity(agentId, targetSessionId);
			// Ignore the "New Chat" placeholder the activity store seeds at session
			// creation — it would otherwise stomp a real title (e.g. when an existing
			// session is re-opened and its activity still carries the create-time
			// placeholder). Fall back to the (real) `title` prop in that case.
			if (isRealTitle(activity?.title)) {
				setDisplayTitle(activity.title as string);
			} else if (isRealTitle(title)) {
				setDisplayTitle(title);
			}
			const pendingPermission =
				activity?.status === "waiting_for_permission"
					? readPendingActivityPermission(activity.pendingPermission)
					: null;
			if (pendingPermission) {
				handlePermissionRequest(pendingPermission);
			} else if (activity && isSettledSessionStatus(activity.status)) {
				// Only drop the card once the turn has genuinely settled (stopped,
				// finished, errored, cancelled…). We must NOT clear on "running":
				// while a permission is still open the status flips to "running" as
				// tokens/messages stream in for the same turn, which used to wipe the
				// card out from under the user before they could answer. Answering is
				// handled explicitly by handlePermissionReply.
				setPendingPermissions((prev) =>
					prev.filter((item) => item.sessionId !== targetSessionId),
				);
			}
		};
		refreshActivity();
		return subscribeSessionActivities(refreshActivity);
	}, [activeSessionId, agentId, handlePermissionRequest, sessionId, title]);

	// Reset the title only when the session identity changes (switching/creating
	// a session), preferring any known activity title. This must NOT depend on
	// the `title` prop: a host that feeds a live title back as `title` would
	// otherwise re-run this and clobber the real activity title with the
	// "New Chat" fallback. Live title updates are owned by the activity effect.
	const lastTitleSessionRef = useRef<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: title is the fallback only, intentionally not a re-run trigger
	useEffect(() => {
		const targetSessionId = activeSessionId || sessionId;
		if (lastTitleSessionRef.current === targetSessionId) return;
		lastTitleSessionRef.current = targetSessionId;
		const activityTitle = getSessionActivity(agentId, targetSessionId)?.title;
		setDisplayTitle(isRealTitle(activityTitle) ? activityTitle : title);
	}, [activeSessionId, agentId, sessionId]);

	// Register this chat in the per-folder cache so the in-chat sidebar can list
	// every chat opened in the folder without hitting the CLI. Records on mount
	// (as a draft for new chats) and keeps sessionId/title fresh as they resolve.
	useEffect(() => {
		if (!chatTabId) return;
		recordChatTab(workspacePath, {
			id: chatTabId,
			agentId,
			sessionId: activeSessionId || sessionId,
			title: displayTitle,
		});
	}, [
		chatTabId,
		workspacePath,
		agentId,
		activeSessionId,
		sessionId,
		displayTitle,
	]);

	// Let the device/back gesture close the sidebar before popping the page.
	useEffect(() => {
		if (!showSidebar) return;
		actionStack.push({
			id: "chat-sidebar",
			action: () => {
				setShowSidebar(false);
			},
		});
		return () => {
			actionStack.remove("chat-sidebar");
		};
	}, [showSidebar]);

	useEffect(() => {
		upsertAcpMessageRef.current = (incomingMessage: AcpMessage) => {
			setAllMessages((prev) => {
				const result = upsertMessage(
					prev,
					incomingMessage,
					{
						isStreaming: chatIsStreaming,
						localUserId: streamingUserIdRef.current,
						localAssistantId: streamingAssistantIdRef.current,
						turnStartedAt: sentTurnStartRef.current,
					},
					mergeLocalUserText,
				);
				return result.messages;
			});
		};
	}, [chatIsStreaming]);

	useEffect(() => {
		if (!chatIsStreaming) return;
		const lastUser = findLast(
			allMessages,
			(message) => message.role === "user",
		);
		const lastAssistant = findLast(
			allMessages,
			(message) => message.role === "assistant",
		);
		if (lastUser?.id) streamingUserIdRef.current = lastUser.id;
		if (
			allMessages[allMessages.length - 1]?.role === "assistant" &&
			lastAssistant?.id
		) {
			streamingAssistantIdRef.current = lastAssistant.id;
		}
	}, [allMessages, chatIsStreaming]);

	const handleSessionOwnerError = useCallback(
		async (details: AcpPromptError) => {
			if (ownerDialogOpenRef.current) return;
			ownerDialogOpenRef.current = true;
			try {
				const shouldEndProcess = await dialog.confirm(
					`This chat is currently owned by the Codex process running on your machine (PID ${details.owner.pid}) in ${details.owner.cwd}. Shellular cannot take ownership while that process is running.\n\nEnding it will stop its current in-memory work, but it will not delete the saved conversation history.`,
					"Chat is read-only",
					{
						confirmLabel: "End Codex process",
						cancelLabel: "Keep read-only",
					},
				);
				if (!shouldEndProcess) {
					setError("This chat remains read-only while Codex owns it.");
					return;
				}

				const recovery = ownerRecoveryRef.current;
				const retryPrompt = ownerRetryRef.current;
				const targetSessionId =
					recovery?.sessionId ?? activeSessionIdRef.current;
				if (!targetSessionId) {
					setError("The read-only session could not be identified.");
					return;
				}

				await acpKillSessionOwner(agentId, targetSessionId);
				const refreshed = await acpAttachSession(
					agentId,
					targetSessionId,
					resolvedWorkspacePath,
				);
				setAllMessages(refreshed.messages);
				setVisibleCount(PAGE_SIZE);
				setSyncing(Boolean(refreshed.syncing));
				setConfigOptions(refreshed.configOptions);
				setAvailableCommands(refreshed.availableCommands);
				remoteBaseIdxRef.current = refreshed.from ?? 0;
				remoteGenerationRef.current = refreshed.generation;
				setHasMoreRemote(refreshed.hasMoreBefore === true);

				if (recovery && retryPrompt) {
					setAllMessages((messages) => {
						const lastMessage = messages[messages.length - 1];
						const recoveredText = composerPartsToText(recovery.parts).trim();
						if (
							lastMessage?.role === "user" &&
							acpMessageText(lastMessage) === recoveredText
						) {
							return messages;
						}
						return [
							...messages,
							{
								id: recovery.userMessageId,
								requestId: recovery.userMessageId,
								role: "user",
								parts: composerPartsToMessageParts(recovery.parts),
								timestamp: Date.now(),
							},
						];
					});
					await retryPrompt();
					return;
				}

				if (recovery) {
					replaceComposerParts(promptInputRef.current, recovery.parts);
					setComposerParts(recovery.parts);
					setImageAttachments(recovery.imageAttachments);
					saveComposerDraft(draftKey, promptInputRef.current);
				}
				ownerRecoveryRef.current = null;
				setError(
					"The Codex process was ended. Your saved chat is intact; review the restored prompt and send it again.",
				);
			} catch (error) {
				setError(error instanceof Error ? error.message : String(error));
			} finally {
				ownerDialogOpenRef.current = false;
			}
		},
		[agentId, draftKey, resolvedWorkspacePath],
	);

	useEffect(() => {
		handleSessionOwnerErrorRef.current = handleSessionOwnerError;
	}, [handleSessionOwnerError]);

	useLayoutEffect(() => {
		appendStopReasonRef.current = appendStopReason;
		finishStreamingTurnRef.current = finishStreamingTurn;
	});

	const openGitReview = useCallback(async () => {
		if (!resolvedWorkspacePath) return;
		const reviewPageId = `git-review-${resolvedWorkspacePath}`;
		const GitClientPage = await import("pages/git-client");
		pushPage(
			reviewPageId,
			<GitClientPage.default
				projectPath={resolvedWorkspacePath}
				projectName={
					resolvedWorkspacePath.split(/[\\/]/).filter(Boolean).pop() ||
					"Project"
				}
				initialReviewComments={reviewComments}
				onReviewDraftChange={setReviewComments}
				onSubmitReview={(comments) => {
					setReviewComments(comments);
					closePage(reviewPageId);
					requestAnimationFrame(() => promptInputRef.current?.focus());
				}}
			/>,
		);
	}, [resolvedWorkspacePath, reviewComments]);

	if (connectionStatus !== "connected" && !allMessages.length) {
		return (
			<Page title={displayTitle} subtitle={providerName} noBottomSafeArea>
				<EmptyState message="Not connected to host" mascot="sleep" />
			</Page>
		);
	}

	return (
		<Page
			title={displayTitle}
			subtitle={workspacePath.split("/").slice(-2).join("/")}
			noBottomSafeArea
			className="chat-page"
			scrollRef={scrollRef}
			titleSlot={
				<span
					className={`chat-header-agent-icon ${getAgentIcon(agentId)}`}
					aria-hidden="true"
				/>
			}
			rightSlot={
				<div className="chat-header-actions">
					{syncing && allMessages.length > 0 && (
						<Loader size={18} mascot={false} />
					)}
					<button
						type="button"
						className="chat-header-review haptic-trigger"
						onClick={openGitReview}
						disabled={connectionStatus !== "connected" || syncing}
						aria-label={
							reviewComments.length
								? `Review Git changes, ${reviewComments.length} pending ${reviewComments.length === 1 ? "comment" : "comments"}`
								: "Review Git changes"
						}
						title="Review Git changes"
					>
						<span className="icon-git-pull-request" aria-hidden="true" />
						{reviewComments.length > 0 && (
							<span className="chat-header-review-count">
								{reviewComments.length}
							</span>
						)}
					</button>
					{chatTabId && (
						<button
							type="button"
							className="chat-sidebar-toggle haptic-trigger"
							onClick={() => setShowSidebar(true)}
							aria-label="Open chats"
						>
							<span className="icon-menu" aria-hidden="true" />
						</button>
					)}
				</div>
			}
		>
			{loading && allMessages.length === 0 && (
				<EmptyState message="Loading messages…" mascot="loading" />
			)}
			{!loading &&
				!syncing &&
				allMessages.length === 0 &&
				!chatIsStreaming &&
				pendingPermissions.length === 0 && (
					<EmptyState message="No messages yet" mascot="greeting" />
				)}
			<div ref={historyContentRef} className="chat-history-content">
				{syncing && allMessages.length === 0 && <ChatHistorySkeleton />}
				{hasMore && historyScrollReady && (
					<div ref={sentinelRef} className="chat-sentinel">
						{loadingMore && <Loader size={24} />}
					</div>
				)}
				{visibleMessageItems.map(
					({
						message: msg,
						messageKey,
						renderKey,
						groupEnd,
						groupParts,
						parts,
						workParts,
						workStartedAt,
						workDurationMs,
					}) => {
						return (
							<ChatBubble
								key={renderKey}
								messageKey={messageKey}
								parts={parts}
								messageRole={msg.role}
								assistantName={assistantName}
								showActions={groupEnd}
								copyParts={groupParts}
								workParts={workParts}
								workStartedAt={workStartedAt}
								workDurationMs={workDurationMs}
								statusLabel={streamingStatusLabel}
								streaming={
									chatIsStreaming &&
									msg.role === "assistant" &&
									msg === lastVisibleMessage
								}
							/>
						);
					},
				)}
				{chatIsStreaming && lastVisibleMessage?.role === "user" && (
					<ChatBubble
						key="assistant-streaming-placeholder"
						messageKey="assistant-streaming-placeholder"
						parts={[]}
						messageRole="assistant"
						assistantName={assistantName}
						streaming
					/>
				)}
				{/* Hold permission cards back until the conversation has hydrated.
				    A stored `pendingPermission` from the activity store can be
				    known before messages finish loading on reopen; rendering the
				    card then shows a context-less prompt over an empty history. */}
				{!loading &&
					pendingPermissions.map((permission) => (
						<PermissionRequestCard
							key={permission.id}
							permission={permission}
							onReply={handlePermissionReply}
						/>
					))}
				{pendingElicitations.map((elicitation) => (
					<ElicitationCard
						key={elicitation.id}
						elicitation={elicitation}
						onReply={handleElicitationReply}
					/>
				))}
				{error && (
					<div className="chat-error">
						<span className="icon-alert-triangle" aria-hidden="true" />
						{error}
					</div>
				)}
				<div className="chat-bottom-anchor" />
			</div>
			<ChatComposer
				inputBarRef={inputBarRef}
				inputRef={promptInputRef}
				agentAvailable={agentAvailable}
				isConnected={connectionStatus === "connected" && !syncing}
				unavailableMessage={unavailableMessage}
				isStreaming={chatIsStreaming}
				isEditingQueuedPrompt={editingQueuedPrompt !== null}
				canSendPrompt={canSendPrompt}
				sendBlockedReason={sendBlockedReason}
				promptSuggestions={promptSuggestions}
				activePromptSuggestionIndex={activePromptSuggestionIndex}
				onPromptSuggestion={applyPromptSuggestion}
				onPromptSuggestionHover={setActivePromptSuggestionIndex}
				onInput={handleComposerInput}
				onKeyDown={handlePromptKeyDown}
				onPaste={handleComposerPaste}
				onAttachFiles={handleAttachFiles}
				onRemoveImageAttachment={handleRemoveImageAttachment}
				imageAttachments={imageAttachments}
				reviewCommentCount={reviewComments.length}
				onOpenGitReview={openGitReview}
				onClearReviewComments={() => setReviewComments([])}
				onSend={handleSend}
				onStop={handleStop}
				contextMeter={contextMeter}
				queueControls={
					<PromptQueueStrip
						items={queuedPrompts}
						onEdit={handleEditQueuedPrompt}
						onRemove={handleRemoveQueuedPrompt}
						editingItem={editingQueuedPrompt}
						editBusy={queueEditBusy}
						onSaveEdit={handleSaveQueuedPrompt}
						onCancelEdit={handleCancelQueuedPrompt}
					/>
				}
				configControls={
					<button
						type="button"
						className="inline-flex h-[34px] min-w-0 max-w-full cursor-pointer items-center gap-[5px] overflow-hidden rounded-[9px] border-0 bg-transparent px-2 text-[12px] font-medium leading-none text-secondary-text transition-[background] duration-150 active:bg-surface-soft [-webkit-tap-highlight-color:transparent]"
						onClick={() => setShowConfigSheet(true)}
					>
						<span
							className="icon-settings shrink-0 text-[1.15rem]"
							aria-hidden="true"
						/>
						{getProminentConfigOptions(configOptions).flatMap((option, i) => {
							const options = flattenConfigValues(option);
							const current = options.find(
								(o) => String(o.value) === String(option.currentValue),
							);
							const tag = (
								<span
									key={`${option.id}-value`}
									className={`min-w-[3ch] max-w-[90px] shrink overflow-hidden text-ellipsis whitespace-nowrap ${option.category === "mode" ? "text-accent" : option.category === "model" ? "text-warning" : option.category === "thought_level" ? "text-[#818cf8]" : ""}`}
								>
									{current?.name ?? String(option.currentValue)}
								</span>
							);
							return i === 0
								? [tag]
								: [
										<span
											key={`${option.id}-sep`}
											className="mx-[3px] shrink-0 opacity-50"
										>
											·
										</span>,
										tag,
									];
						})}
					</button>
				}
			/>
			<BottomSheet
				open={showConfigSheet}
				onClose={() => setShowConfigSheet(false)}
				title="Session Configuration"
			>
				<div className="flex flex-col">
					{getProminentConfigOptions(configOptions).map((option) => {
						const options = flattenConfigValues(option).map((item) => ({
							value: item.value,
							label: item.name,
						}));
						const ConfigControl = shouldUseConfigCombobox(option, options)
							? AppCombobox
							: AppSelect;
						return (
							<div
								key={option.id}
								className="flex items-center justify-between gap-3 py-3 px-1 border-b border-(--card-border) last:border-b-0"
							>
								<div className="flex items-center gap-3 min-w-0 shrink-0">
									<span
										className={`${getConfigIcon(option)} text-(--secondary-text) text-lg shrink-0`}
										aria-hidden="true"
									/>
									<span className="text-sm font-medium text-(--primary-text)">
										{option.name}
									</span>
								</div>
								{/* Changing config mid-generation is explicitly allowed by ACP
								    ("the current mode can be changed at any point during a
								    session, whether the Agent is idle or generating"). Only
								    disable while syncing: during an attach reconcile the agent
								    may not have registered the session yet, so a set can fail. */}
								<ConfigControl
									value={String(option.currentValue)}
									disabled={syncing || configSavingId === option.id}
									onChange={(nextValue) =>
										handleConfigChange(option, nextValue)
									}
									ariaLabel={option.name}
									options={options}
									size="compact"
									menuPlacement="top"
									className={`min-w-0 flex-1 justify-end ${configSavingId === option.id ? "opacity-45" : ""}`}
								/>
							</div>
						);
					})}
				</div>
			</BottomSheet>
			<BottomSheet
				open={showContextSheet}
				onClose={() => setShowContextSheet(false)}
				title="Context Window"
			>
				{contextWindowUsage && (
					<ContextWindowDetails usage={contextWindowUsage} />
				)}
			</BottomSheet>
			{chatTabId && (
				<ChatSidebar
					open={showSidebar}
					onClose={() => setShowSidebar(false)}
					workspacePath={workspacePath}
					activeTabId={chatTabId}
					currentAgentId={agentId}
				/>
			)}
		</Page>
	);

	async function handleSend() {
		if (editingQueuedPrompt) return;
		const composerOnlyParts = readComposerParts(promptInputRef.current);
		const text = composerPartsToText(composerOnlyParts).trim();
		const pendingImages = imageAttachments;
		const pendingReviewComments = reviewComments;
		const reviewPrompt = formatGitReviewPrompt(pendingReviewComments);
		const promptText = [text, reviewPrompt].filter(Boolean).join("\n\n");
		if (
			!promptText &&
			!composerOnlyParts.some((part) => part.type === "attachment") &&
			pendingImages.length === 0
		) {
			return;
		}
		if (
			composerOnlyParts.some(
				(part) => part.type === "attachment" && part.attachment.status,
			) ||
			pendingImages.some((attachment) => attachment.status)
		) {
			return;
		}

		// Image badges are appended after the composer text/@-mentions so the
		// resource links ride along with the prompt.
		const parts: ComposerPart[] = [
			...composerOnlyParts,
			...pendingImages.map((attachment) => ({
				type: "attachment" as const,
				attachment,
			})),
		];

		setError("");
		setComposerParts([]);
		setImageAttachments([]);
		setReviewComments([]);
		setComposerTrigger(null);
		setFileSuggestions([]);
		clearComposer(promptInputRef.current);
		// The composer is empty now, so this drops the draft — without it the
		// restore effect would put the just-sent prompt straight back.
		saveComposerDraft(draftKey, promptInputRef.current);
		// Sending is an explicit "take me to the new turn", so it outranks any
		// selection still sitting in the transcript.
		selectionActiveRef.current = false;
		scrollToBottom(true);
		stickToBottomRef.current = true;

		const queuedSessionId = activeSessionId || sessionId;
		const queueThisPrompt =
			queuedSessionId &&
			shouldQueuePrompt({
				sessionId: queuedSessionId,
				sessionIsStreaming: getSessionStreaming(agentId, queuedSessionId),
				queuedSessionIds: queuedPrompts.map((item) => item.sessionId),
			});
		if (queuedSessionId && queueThisPrompt) {
			try {
				const content = await composerPartsToAcpContent(parts);
				acpQueuePrompt(agentId, queuedSessionId, text, content);
			} catch (err) {
				setError(getErrorMessage(err));
			}
			return;
		}

		const sentAt = Date.now();
		sentTurnStartRef.current = sentAt;
		const userId = `user_local_${sentAt}`;
		ownerRecoveryRef.current = {
			sessionId: activeSessionId || sessionId,
			userMessageId: userId,
			parts,
			imageAttachments: pendingImages,
		};
		streamingUserIdRef.current = userId;
		streamingAssistantIdRef.current = null;
		streamedTextRef.current.clear();
		setAllMessages((prev) => [
			...prev,
			{
				id: userId,
				requestId: userId,
				role: "user",
				parts: [
					...composerPartsToMessageParts(parts),
					...(reviewPrompt
						? [{ type: "text" as const, text: `\n\n${reviewPrompt}` }]
						: []),
				],
				timestamp: Date.now(),
			},
		]);

		const callbacks: AcpPromptCallbacks = {
			onToken: () => {},
			onUsage: (usage) => {
				const nextUsage = readContextWindowUsage({ usage });
				if (nextUsage) setContextWindowUsage(nextUsage);
			},
			onEnd: (stopReason) => {
				ownerRecoveryRef.current = null;
				ownerRetryRef.current = null;
				if (shouldShowStopReason(stopReason)) {
					appendStopReason(stopReason);
				}
				finishStreamingTurn();
			},
			onError: (err, details) => {
				finishStreamingTurn();
				if (details) {
					void handleSessionOwnerError(details);
				} else {
					ownerRecoveryRef.current = null;
					ownerRetryRef.current = null;
					setError(err);
				}
			},
			onMessage: (msg) => {
				upsertAcpMessageRef.current(msg);
			},
			onPermission: handlePermissionRequest,
		};

		try {
			let targetSessionId = activeSessionId;
			if (createOnFirstMessage && !targetSessionId) {
				if (!createSessionPromiseRef.current) {
					// `session/new` returns everything needed to start prompting, so no
					// attach follows it. Per ACP, `session/load` exists to resume a
					// *previous* conversation; a session created moments ago has no
					// history to replay. Attaching here also forced the CLI down its
					// cold-miss path, which emits `syncing: "messages"` and clears it
					// milliseconds later — before the subscription below exists — so
					// the chat stayed stuck on its loading skeleton.
					createSessionPromiseRef.current = acpCreateSession(
						agentId,
						resolvedWorkspacePath || ".",
						"",
						configOptions,
					).then((result) => ({
						sessionId: result.session.id ?? "",
						configOptions: result.configOptions,
						availableCommands: result.availableCommands,
						messages: [],
						revision: result.revision,
						syncing: false,
					}));
				}
				const result = await createSessionPromiseRef.current;
				targetSessionId = result.sessionId;
				if (ownerRecoveryRef.current) {
					ownerRecoveryRef.current.sessionId = targetSessionId;
				}
				setActiveSessionId(targetSessionId);
				activeSessionIdRef.current = targetSessionId;
				setConfigOptions(result.configOptions);
				setAvailableCommands(result.availableCommands);
				// A freshly created session has no history, but the optimistic user
				// bubble for the message being sent is already in state — keep it
				// rather than clobbering it with the (empty) attach result.
				if (result.messages.length) setAllMessages(result.messages);
				setSyncing(Boolean(result.syncing));
				cleanupRef.current?.();
				attachReadyRef.current = true;
				attachedSessionIdRef.current = targetSessionId;
				attachedRevisionRef.current = result.revision;
				cleanupRef.current = acpSubscribeSessionEvents(
					agentId,
					targetSessionId,
					applyRevisionedSessionEvent,
				);
			}
			if (!targetSessionId) throw new Error("Unable to create ACP session");
			if (pendingConfigChangesRef.current.size) {
				await flushPendingConfigChanges(targetSessionId);
			}
			const content = await composerPartsToAcpContent(parts);
			if (reviewPrompt) content.push({ type: "text", text: reviewPrompt });
			const sendPrompt = () => {
				setSessionStreaming(agentId, targetSessionId, true);
				directPromptDispatchRef.current = {
					sessionId: targetSessionId,
				};
				const cleanup = acpPrompt(
					agentId,
					targetSessionId,
					promptText,
					callbacks,
					content,
				);
				cleanupSendRef.current = cleanup;
			};
			ownerRetryRef.current = sendPrompt;
			sendPrompt();
		} catch (err) {
			finishStreamingTurn();
			setError(getErrorMessage(err));
		}
	}

	function applyPromptSuggestion(suggestion: PromptSuggestion) {
		if (suggestion.trigger === "@" && suggestion.file) {
			insertAttachmentSuggestion(
				promptInputRef.current,
				suggestion.file,
				composerTrigger,
			);
		} else {
			replaceComposerTrigger(
				promptInputRef.current,
				composerTrigger,
				suggestion.replacement,
			);
		}
		const nextParts = readComposerParts(promptInputRef.current);
		setComposerParts(nextParts);
		setComposerTrigger(null);
		setFileSuggestions([]);
		setActivePromptSuggestionIndex(0);
		requestAnimationFrame(() => {
			const input = promptInputRef.current;
			if (!input) return;
			input.focus();
		});
	}

	async function handlePermissionReply(
		permission: AcpPermissionRequest,
		optionId: string,
	) {
		// Optimistically remove the card so the tap feels instant.
		setPendingPermissions((prev) =>
			prev.filter((item) => item.id !== permission.id),
		);
		try {
			await acpPermissionReply(
				agentId,
				permission.sessionId || activeSessionIdRef.current || sessionId,
				permission.id,
				optionId,
			);
		} catch (err) {
			// The reply never reached the agent, so it is still blocked waiting on
			// this exact permission. Put the card back so the user can retry rather
			// than being stranded with a wedged, un-answerable turn.
			setPendingPermissions((prev) =>
				prev.some((item) => item.id === permission.id)
					? prev
					: [...prev, permission],
			);
			setPermissionScrollTick((tick) => tick + 1);
			setError(getErrorMessage(err));
		}
	}

	async function handleStop() {
		const targetSessionId = activeSessionIdRef.current || sessionId;
		if (!targetSessionId) return;
		try {
			await acpCancel(agentId, targetSessionId);
		} catch (err) {
			finishStreamingTurn(targetSessionId);
			setError(getErrorMessage(err));
		}
	}

	async function handleEditQueuedPrompt(item: AcpQueuedPrompt) {
		if (queueEditBusy || editingQueuedPrompt) return;
		queuedEditComposerBackupRef.current = {
			parts: readComposerParts(promptInputRef.current),
			imageAttachments: [...imageAttachments],
		};
		setQueueEditBusy(true);
		try {
			setError("");
			const pausedQueue = await acpSetPromptQueuePaused(
				agentId,
				item.sessionId,
				true,
			);
			setQueuedPrompts(pausedQueue);
			const pausedItem =
				pausedQueue.find((queuedItem) => queuedItem.id === item.id) ?? item;
			setEditingQueuedPrompt(pausedItem);
			setImageAttachments([]);
			setComposerTrigger(null);
			setFileSuggestions([]);
			replaceComposerParts(
				promptInputRef.current,
				queuedPromptToComposerParts(pausedItem, resolvedWorkspacePath),
			);
			syncComposerState();
			requestAnimationFrame(() => promptInputRef.current?.focus());
		} catch (err) {
			queuedEditComposerBackupRef.current = null;
			setError(getErrorMessage(err));
		} finally {
			setQueueEditBusy(false);
		}
	}

	async function handleSaveQueuedPrompt() {
		const item = editingQueuedPrompt;
		if (!item || queueEditBusy) return;
		const composerOnlyParts = readComposerParts(promptInputRef.current);
		const parts: ComposerPart[] = [
			...composerOnlyParts,
			...imageAttachments.map((attachment) => ({
				type: "attachment" as const,
				attachment,
			})),
		];
		const text = composerPartsToText(parts).trim();
		if (!text && !parts.some((part) => part.type === "attachment")) {
			native.toast("Queued prompt cannot be empty");
			return;
		}
		if (
			parts.some((part) => part.type === "attachment" && part.attachment.status)
		) {
			native.toast("Resolve the attachment before saving this prompt");
			return;
		}

		setQueueEditBusy(true);
		try {
			setError("");
			const content = await composerPartsToAcpContent(parts);
			const queue = await acpUpdateQueuedPrompt(
				agentId,
				item.sessionId,
				item.id,
				text,
				content,
			);
			setQueuedPrompts(queue);
			setQueuedPrompts(
				await acpSetPromptQueuePaused(agentId, item.sessionId, false),
			);
			restoreQueuedEditComposer();
			setEditingQueuedPrompt(null);
		} catch (err) {
			setError(getErrorMessage(err));
		}
		setQueueEditBusy(false);
	}

	async function handleCancelQueuedPrompt() {
		const item = editingQueuedPrompt;
		if (!item || queueEditBusy) return;
		setQueueEditBusy(true);
		try {
			setError("");
			setQueuedPrompts(
				await acpSetPromptQueuePaused(agentId, item.sessionId, false),
			);
			restoreQueuedEditComposer();
			setEditingQueuedPrompt(null);
		} catch (err) {
			setError(getErrorMessage(err));
		}
		setQueueEditBusy(false);
	}

	function restoreQueuedEditComposer() {
		const backup = queuedEditComposerBackupRef.current;
		if (backup) {
			replaceComposerParts(promptInputRef.current, backup.parts);
			setImageAttachments(backup.imageAttachments);
		} else {
			clearComposer(promptInputRef.current);
			setImageAttachments([]);
		}
		queuedEditComposerBackupRef.current = null;
		setComposerTrigger(null);
		setFileSuggestions([]);
		syncComposerState();
		saveComposerDraft(draftKey, promptInputRef.current);
		requestAnimationFrame(() => promptInputRef.current?.focus());
	}

	async function handleRemoveQueuedPrompt(item: AcpQueuedPrompt) {
		try {
			setError("");
			const queue = await acpRemoveQueuedPrompt(
				agentId,
				item.sessionId,
				item.id,
			);
			setQueuedPrompts(queue);
		} catch (err) {
			setError(getErrorMessage(err));
		}
	}

	function appendStopReason(stopReason: string) {
		const activeId = streamingAssistantIdRef.current;
		const activeUserId = streamingUserIdRef.current;
		const stopReasonPart = createStopReasonPart(stopReason);
		if (!stopReasonPart) return;
		setAllMessages((prev) => {
			const userIndex = activeUserId
				? prev.findIndex((message) => message.id === activeUserId)
				: -1;
			const fallbackUserIndex = findLastIndex(
				prev,
				(message) => message.role === "user",
			);
			const turnStartIndex = userIndex >= 0 ? userIndex : fallbackUserIndex;
			if (turnStartIndex < 0) return prev;

			// A turn emits several assistant messages, so the stop reason belongs
			// on its LAST one — the tail tracked during streaming when available,
			// otherwise the final assistant message of the turn. Taking the first
			// match would strand "Stopped by user" mid-answer.
			const activeIndex = activeId
				? prev.findIndex(
						(message, index) =>
							index > turnStartIndex && message.id === activeId,
					)
				: -1;
			let lastAssistantIndex = -1;
			for (let index = prev.length - 1; index > turnStartIndex; index -= 1) {
				if (prev[index].role === "assistant") {
					lastAssistantIndex = index;
					break;
				}
			}
			const assistantIndex =
				activeIndex >= 0 ? activeIndex : lastAssistantIndex;

			if (assistantIndex < 0) {
				return [
					...prev.slice(0, turnStartIndex + 1),
					createStopReasonMessage(stopReasonPart),
					...prev.slice(turnStartIndex + 1),
				];
			}

			return prev.map((message, index) => {
				if (index !== assistantIndex) return message;
				const parts = removeStopReasonParts(message.parts);
				return {
					...message,
					parts: [...parts, stopReasonPart],
				};
			});
		});
	}

	function finishStreamingTurn(
		sessionIdToUse = activeSessionIdRef.current || sessionId,
	) {
		const completedUserId = streamingUserIdRef.current;
		const duration = getElapsedDurationMs(sentTurnStartRef.current);
		if (completedUserId && duration !== undefined) {
			setTurnDurationByUserId((current) =>
				current[completedUserId] === duration
					? current
					: { ...current, [completedUserId]: duration },
			);
		}
		cleanupSendRef.current?.();
		cleanupSendRef.current = null;
		setSessionStreaming(agentId, sessionIdToUse, false);
		streamingUserIdRef.current = null;
		streamingAssistantIdRef.current = null;
		directPromptDispatchRef.current = null;
		streamedTextRef.current.clear();
	}

	/**
	 * Apply config picks the user made while the chat was still a draft. Runs
	 * before the first prompt so the turn uses the mode/model they chose. Failures
	 * are surfaced but never block the send — the session is valid either way, it
	 * just runs with the agent's default for that option.
	 */
	async function flushPendingConfigChanges(targetSessionId: string) {
		const pending = [...pendingConfigChangesRef.current.values()];
		pendingConfigChangesRef.current.clear();
		for (const { option, value } of pending) {
			try {
				const setMethod = (option as { _setMethod?: unknown })._setMethod;
				if (setMethod === "mode") {
					await acpSetMode(agentId, targetSessionId, String(value));
				} else {
					const nextOptions = await acpSetConfigOption(
						agentId,
						targetSessionId,
						option.id,
						value,
					);
					if (nextOptions.length) setConfigOptions(nextOptions);
				}
			} catch (err) {
				setError(getErrorMessage(err));
			}
		}
	}

	async function handleConfigChange(
		option: AiSessionConfigOption,
		value: string,
	) {
		const nextValue =
			typeof option.currentValue === "boolean" ? value === "true" : value;
		setError("");
		setConfigSavingId(option.id);
		setConfigOptions((prev) =>
			prev.map((item) =>
				item.id === option.id ? { ...item, currentValue: nextValue } : item,
			),
		);
		try {
			const targetSessionId = activeSessionId || sessionId;
			// A draft chat has no session to configure yet. Keep the pick in local
			// state (already applied above) and replay it onto the real session the
			// moment the first send creates one.
			if (!targetSessionId) {
				pendingConfigChangesRef.current.set(option.id, {
					option,
					value: nextValue,
				});
				return;
			}
			const setMethod = (option as { _setMethod?: unknown })._setMethod;
			if (setMethod === "mode") {
				await acpSetMode(agentId, targetSessionId, String(nextValue));
			} else {
				const nextOptions = await acpSetConfigOption(
					agentId,
					targetSessionId,
					option.id,
					nextValue,
				);
				if (nextOptions.length) setConfigOptions(nextOptions);
			}
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setConfigSavingId(null);
		}
	}

	function handleComposerInput() {
		saveComposerDraft(draftKey, promptInputRef.current);
		syncComposerState();
	}

	function handleComposerPaste(event: React.ClipboardEvent<HTMLDivElement>) {
		event.preventDefault();
		const clipboard = event.clipboardData;
		const text = plainTextFromClipboard(clipboard);
		if (text) {
			// Pasted text still belongs inline in the composer at the caret.
			insertComposerParts(promptInputRef.current, [{ type: "text", text }]);
			handleComposerInput();
		}

		const images = imageFilesFromClipboard(clipboard);
		if (images.length) attachImageFiles(images, "pasted");
	}

	// Add a removable badge for each image and upload it in the background,
	// swapping the pending badge for the saved attachment. Badges live above the
	// composer (not inline), so `origin` decides the filename prefix — images
	// dropped via the attach button read "attached", clipboard images "pasted".
	function attachImageFiles(images: File[], origin: "pasted" | "attached") {
		const pendingUploads: { file: File; attachment: ComposerAttachment }[] = [];
		for (let index = 0; index < images.length; index += 1) {
			const attachment = createPendingImageAttachment(
				images[index],
				index,
				origin,
			);
			pendingUploads.push({ file: images[index], attachment });
		}
		if (!pendingUploads.length) return;

		setImageAttachments((prev) => [
			...prev,
			...pendingUploads.map((upload) => upload.attachment),
		]);
		updateInputOffset();

		for (const upload of pendingUploads) {
			savePastedImageAttachment(upload.file, upload.attachment)
				.then((attachment) => {
					setImageAttachments((prev) =>
						prev.map((item) =>
							item.id === upload.attachment.id ? attachment : item,
						),
					);
					updateInputOffset();
				})
				.catch((err) => {
					setImageAttachments((prev) =>
						prev.map((item) =>
							item.id === upload.attachment.id
								? { ...item, status: "error" }
								: item,
						),
					);
					updateInputOffset();
					setError(getErrorMessage(err));
				});
		}
	}

	function handleAttachFiles(files: File[]) {
		const images = files.filter((file) => file.type.startsWith("image/"));
		if (!images.length) return;
		attachImageFiles(images, "attached");
		requestAnimationFrame(() => promptInputRef.current?.focus());
	}

	function handleRemoveImageAttachment(id: string) {
		setImageAttachments((prev) => prev.filter((item) => item.id !== id));
		updateInputOffset();
	}

	async function savePastedImageAttachment(
		file: File,
		pendingAttachment: ComposerAttachment,
	) {
		const attachmentSessionId = await getAttachmentSessionId();
		const ext = imageExtension(file);
		const bytes = new Uint8Array(await file.arrayBuffer());
		const attachment = await acpWriteAttachmentBase64({
			agentId,
			sessionId: attachmentSessionId,
			name: pendingAttachment.name,
			content: bytesToBase64(bytes),
			mimeType: file.type || `image/${ext}`,
		});
		return {
			id: pendingAttachment.id,
			path: attachment.path,
			relativePath: attachment.name,
			name: attachment.name,
			size: attachment.size,
			mimeType: attachment.mimeType || file.type || `image/${ext}`,
		};
	}

	async function getAttachmentSessionId() {
		if (activeSessionId) return activeSessionId;
		if (sessionId) return sessionId;
		if (createSessionPromiseRef.current) {
			const result = await createSessionPromiseRef.current;
			if (result.sessionId) return result.sessionId;
		}
		return "draft";
	}

	function handlePromptKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		if (promptSuggestions.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setActivePromptSuggestionIndex(
					(index) => (index + 1) % promptSuggestions.length,
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setActivePromptSuggestionIndex(
					(index) =>
						(index - 1 + promptSuggestions.length) % promptSuggestions.length,
				);
				return;
			}
			if (e.key === "Tab") {
				e.preventDefault();
				applyPromptSuggestion(
					promptSuggestions[
						Math.min(activePromptSuggestionIndex, promptSuggestions.length - 1)
					],
				);
				return;
			}
		}
	}
}

function queuedPromptToComposerParts(
	item: AcpQueuedPrompt,
	workspacePath: string,
): ComposerPart[] {
	const parts = item.content.flatMap<ComposerPart>((block, index) => {
		if (block.type === "text") {
			return block.text ? [{ type: "text", text: block.text }] : [];
		}
		if (block.type !== "resource_link") return [];

		const path = normalizeEditorPath(block.uri, workspacePath).path;
		const relativePath = block.title || block.name || path;
		const name =
			block.name ||
			relativePath.split(/[\\/]/).pop() ||
			`attachment-${index + 1}`;
		return [
			{
				type: "attachment",
				attachment: {
					id: `queued:${item.id}:${index}`,
					path,
					relativePath,
					name,
					size: block.size ?? undefined,
					mimeType: block.mimeType ?? undefined,
				},
			},
		];
	});
	return parts.length || !item.text
		? parts
		: [{ type: "text", text: item.text }];
}

function PromptQueueStrip({
	items,
	onEdit,
	onRemove,
	editingItem,
	editBusy,
	onSaveEdit,
	onCancelEdit,
}: {
	items: AcpQueuedPrompt[];
	onEdit: (item: AcpQueuedPrompt) => void;
	onRemove: (item: AcpQueuedPrompt) => void;
	editingItem: AcpQueuedPrompt | null;
	editBusy: boolean;
	onSaveEdit: () => void;
	onCancelEdit: () => void;
}) {
	if (!items.length && !editingItem) return null;

	return (
		<section
			className="flex min-w-0 flex-col gap-1.5 pb-0.5"
			aria-label="Queued prompts"
		>
			<div className="inline-flex items-center gap-1.5 text-[12px] font-semibold leading-none text-secondary-text">
				<span className="icon-clock" aria-hidden="true" />
				<span>{items.length} queued</span>
			</div>
			<div className="flex max-h-[156px] flex-col gap-1.5 overflow-y-auto pr-0.5 [-webkit-overflow-scrolling:touch]">
				{items.map((item, index) => {
					const isEditing = editingItem?.id === item.id;
					return (
						<div
							key={item.id}
							className={`grid min-h-[34px] w-full shrink-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-1 rounded-lg border bg-surface-soft pl-2 pr-[3px] text-primary-text ${isEditing ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface-soft))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-card-border"}`}
							aria-current={isEditing ? "true" : undefined}
						>
							<span
								className={`grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] font-bold leading-none ${isEditing ? "bg-accent text-[var(--active-text-color)]" : "bg-secondary text-secondary-text"}`}
							>
								{index + 1}
							</span>
							<span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] leading-tight">
								{isEditing && (
									<span className="inline-flex shrink-0 items-center gap-[3px] rounded px-[5px] py-0.5 text-[10px] font-bold uppercase leading-none text-accent bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
										<span className="icon-edit-3" aria-hidden="true" />
										Editing
									</span>
								)}
								<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
									{item.text}
								</span>
							</span>
							<div className="flex shrink-0 items-center gap-0.5">
								{isEditing ? (
									<>
										<button
											type="button"
											className="haptic-trigger inline-flex min-h-7 items-center justify-center gap-1 rounded-md border-0 bg-secondary px-2 text-[11px] font-semibold whitespace-nowrap text-secondary-text disabled:cursor-default disabled:opacity-45"
											onClick={onCancelEdit}
											disabled={editBusy}
										>
											<span className="icon-x" aria-hidden="true" />
											Cancel
										</button>
										<button
											type="button"
											className="haptic-trigger inline-flex min-h-7 items-center justify-center gap-1 rounded-md border-0 bg-accent px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--active-text-color)] disabled:cursor-default disabled:opacity-45"
											onClick={onSaveEdit}
											disabled={editBusy}
										>
											<span className="icon-check" aria-hidden="true" />
											{editBusy ? "Saving..." : "Save"}
										</button>
									</>
								) : (
									<>
										<button
											type="button"
											className="haptic-trigger flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[13px] text-secondary-text [-webkit-tap-highlight-color:transparent] active:bg-card-border active:text-primary-text disabled:cursor-default disabled:opacity-35"
											onClick={() => onEdit(item)}
											disabled={editBusy || editingItem !== null}
											aria-label="Edit queued prompt"
										>
											<span className="icon-edit-3" aria-hidden="true" />
										</button>
										<button
											type="button"
											className="haptic-trigger flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[13px] text-secondary-text [-webkit-tap-highlight-color:transparent] active:bg-card-border active:text-primary-text disabled:cursor-default disabled:opacity-35"
											onClick={() => onRemove(item)}
											disabled={editBusy || editingItem !== null}
											aria-label="Remove queued prompt"
										>
											<span className="icon-x" aria-hidden="true" />
										</button>
									</>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function ChatHistorySkeleton() {
	return (
		<div className="chat-skeleton" aria-hidden="true">
			<div className="chat-skeleton-row chat-skeleton-row--assistant">
				<div className="chat-skeleton-label" />
				<div className="chat-skeleton-bubble">
					<span className="chat-skeleton-line chat-skeleton-line--wide" />
					<span className="chat-skeleton-line" />
					<span className="chat-skeleton-line chat-skeleton-line--short" />
				</div>
			</div>
			<div className="chat-skeleton-row chat-skeleton-row--user">
				<div className="chat-skeleton-label" />
				<div className="chat-skeleton-bubble">
					<span className="chat-skeleton-line chat-skeleton-line--medium" />
				</div>
			</div>
			<div className="chat-skeleton-row chat-skeleton-row--assistant">
				<div className="chat-skeleton-label" />
				<div className="chat-skeleton-bubble">
					<span className="chat-skeleton-line chat-skeleton-line--wide" />
					<span className="chat-skeleton-line chat-skeleton-line--medium" />
				</div>
			</div>
		</div>
	);
}

function ContextWindowDetails({ usage }: { usage: ContextWindowUsage }) {
	const percentage = getContextWindowPercentage(
		usage.usedTokens,
		usage.maxTokens,
	);
	const clampedPercentage =
		percentage === null ? 0 : Math.max(0, Math.min(100, percentage));
	const remainingTokens = Math.max(0, usage.maxTokens - usage.usedTokens);
	const state = getContextWindowState(clampedPercentage);
	const percentageLabel =
		percentage === null ? "Unknown" : `${Math.round(percentage)}%`;
	return (
		<section className="chat-context-sheet">
			<div className="chat-context-sheet__summary">
				<strong>{percentageLabel} used</strong>
				<span>{formatExactTokenCount(remainingTokens)} remaining</span>
			</div>
			<div className={`chat-context-sheet__bar is-${state}`} aria-hidden="true">
				<span style={{ width: `${clampedPercentage}%` }} />
			</div>
			<div className="chat-context-sheet__meta">
				<span>
					Used {formatExactTokenCount(usage.usedTokens)} of{" "}
					{formatExactTokenCount(usage.maxTokens)}
				</span>
				<span>{formatTokenCount(remainingTokens)} left</span>
			</div>
		</section>
	);
}

function handleFiles(click: MouseEvent, workspacePath: string) {
	const target = click.target as HTMLElement;

	const anchor = target.closest("a") as HTMLAnchorElement | null;
	if (anchor) {
		const href = anchor.getAttribute("href");
		if (!href) return;
		click.preventDefault();
		click.stopPropagation();
		if (href.startsWith("http")) {
			native.openInBrowser(href);
			return;
		}

		openEditorPath(href, workspacePath, true);
		return;
	}

	const fileRef = target.closest(
		".file-reference, .file-change",
	) as HTMLElement;
	if (fileRef) {
		const path = fileRef.dataset.path;
		if (path) {
			click.preventDefault();
			click.stopPropagation();
			openEditorPath(path, workspacePath, true);
		}
	}
}

function readPendingActivityPermission(
	value: unknown,
): AcpPermissionRequest | null {
	if (!value || typeof value !== "object") return null;
	const permission = value as Record<string, unknown>;
	const id = permission.id;
	const sessionId = permission.sessionId;
	if (typeof id !== "string" || typeof sessionId !== "string") return null;
	return {
		id,
		sessionId,
		callId:
			typeof permission.callId === "string" ? permission.callId : undefined,
		kind: typeof permission.kind === "string" ? permission.kind : undefined,
		title:
			typeof permission.title === "string"
				? permission.title
				: "Permission requested",
		options: Array.isArray(permission.options) ? permission.options : [],
		metadata: permission.metadata,
	};
}

function plainTextFromClipboard(clipboard: DataTransfer) {
	const text = clipboard.getData("text/plain");
	if (text) return text;
	const html = clipboard.getData("text/html");
	if (!html) return "";
	const doc = new DOMParser().parseFromString(html, "text/html");
	for (const node of Array.from(doc.querySelectorAll("style, script"))) {
		node.remove();
	}
	return doc.body.textContent ?? "";
}

function imageFilesFromClipboard(clipboard: DataTransfer) {
	const files: File[] = [];
	const seen = new Set<string>();
	const appendFile = (file: File) => {
		if (!file.type.startsWith("image/")) return;
		const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
		if (seen.has(key)) return;
		seen.add(key);
		files.push(file);
	};
	for (const item of Array.from(clipboard.items)) {
		if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
		const file = item.getAsFile();
		if (file) appendFile(file);
	}
	for (const file of Array.from(clipboard.files)) {
		appendFile(file);
	}
	return files;
}

function imageExtension(file: File) {
	const fromName = file.name.split(".").pop()?.toLowerCase();
	if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
	switch (file.type) {
		case "image/jpeg":
			return "jpg";
		case "image/gif":
			return "gif";
		case "image/webp":
			return "webp";
		case "image/avif":
			return "avif";
		case "image/svg+xml":
			return "svg";
		default:
			return "png";
	}
}

function openEditorPath(
	rawPath: string,
	workspacePath: string,
	readOnly?: boolean,
) {
	const target = normalizeEditorPath(rawPath, workspacePath);
	const pageKey = target.line ? `${target.path}:${target.line}` : target.path;
	pushPage(
		pageKey,
		<EditorPage
			readOnly={readOnly}
			filePath={target.path}
			initialLine={target.line}
			initialColumn={target.column}
			pageId={pageKey}
		/>,
	);
}

function readConfigOptions(value: unknown): AiSessionConfigOption[] | null {
	return Array.isArray(value) ? (value as AiSessionConfigOption[]) : null;
}

function readAvailableCommands(value: unknown): AcpAvailableCommand[] | null {
	return Array.isArray(value) ? (value as AcpAvailableCommand[]) : null;
}

function getProminentConfigOptions(options: AiSessionConfigOption[]) {
	const supported = options.filter(
		(option) => option.type === "select" && flattenConfigValues(option).length,
	);
	const preferred = supported.filter((option) =>
		["mode", "model", "thought_level"].includes(String(option.category ?? "")),
	);
	return (preferred.length ? preferred : supported).slice(0, 3);
}

function flattenConfigValues(option: AiSessionConfigOption) {
	const values: { value: string; name: string }[] = [];
	for (const item of option.options ?? []) {
		if ("options" in item && Array.isArray(item.options)) {
			for (const child of item.options) {
				values.push({
					value: String(child.value),
					name: child.name || String(child.value),
				});
			}
			continue;
		}
		if ("value" in item) {
			values.push({
				value: String(item.value),
				name: item.name || String(item.value),
			});
		}
	}
	return values;
}

function shouldUseConfigCombobox(
	option: AiSessionConfigOption,
	options: { value: string; label: string }[],
) {
	return option.category === "model" || options.length > 10;
}

function formatExactTokenCount(value: number) {
	return Math.round(value).toLocaleString();
}

function getConfigIcon(option: AiSessionConfigOption) {
	if (option.category === "model") return "icon-tool";
	if (option.category === "thought_level") return "icon-message-square";
	return "icon-settings";
}

function hasVisibleText(message: AcpMessage) {
	return message.parts.some(
		(part) => part.type === "text" && part.text.trim().length > 0,
	);
}

function mergeLocalUserText(
	incoming: AcpMessage,
	local: AcpMessage,
): AcpMessage {
	if (incoming.role !== "user") return incoming;
	const missingLocalAttachments = local.parts.filter(
		(part) =>
			part.type === "file_reference" &&
			!incoming.parts.some(
				(incomingPart) =>
					incomingPart.type === "file_reference" &&
					incomingPart.path === part.path,
			),
	);
	if (hasVisibleText(incoming)) {
		return missingLocalAttachments.length
			? {
					...incoming,
					parts: local.parts,
				}
			: incoming;
	}
	const localTextParts = local.parts.filter(
		(part) => part.type === "text" && part.text.trim().length > 0,
	);
	const localFallbackParts = [...localTextParts, ...missingLocalAttachments];
	if (!localFallbackParts.length) return incoming;
	return {
		...incoming,
		parts: incoming.parts.length
			? [...incoming.parts, ...localFallbackParts]
			: localFallbackParts,
	};
}

function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
	for (let i = arr.length - 1; i >= 0; i--) {
		if (predicate(arr[i])) return arr[i];
	}
}

function removeStopReasonParts(parts: AcpMessagePart[]) {
	return parts.filter((part) => !isStopReasonPart(part));
}

function isStopReasonPart(part: AcpMessagePart) {
	return (
		part.type === "text" &&
		"metadata" in part &&
		(part as { metadata?: unknown }).metadata === STOP_REASON_METADATA
	);
}

function shouldShowStopReason(
	stopReason: string | undefined,
): stopReason is string {
	return Boolean(stopReason && formatStopReason(stopReason));
}

function createStopReasonPart(stopReason: string): AcpMessagePart | null {
	const text = formatStopReason(stopReason);
	if (!text) return null;
	return {
		type: "text",
		text,
		metadata: STOP_REASON_METADATA,
	};
}

function createStopReasonMessage(stopReasonPart: AcpMessagePart): AcpMessage {
	return {
		id: `assistant_stop_${Date.now()}`,
		role: "assistant",
		parts: [stopReasonPart],
		timestamp: Date.now(),
	};
}
