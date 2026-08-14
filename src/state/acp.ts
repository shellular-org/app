import {
	type AcpAvailableCommand,
	type AcpContentBlock,
	type AcpMessage,
	type AiAttachmentWriteResultMsg,
	type AiBackend,
	type AiEventMsg,
	type AiMessagesListResultMsg,
	type AiPermissionReplyAckMsg,
	type AiPromptMsg,
	type AiSession,
	type AiSessionAttachResultMsg,
	type AiSessionConfigOption,
	type AiSessionConfigSetResultMsg,
	type AiSessionCreateResultMsg,
	type AiSessionDetachResultMsg,
	type AiSessionListResultMsg,
	type AiSessionModeSetResultMsg,
	type AiSessionOwner,
	type AiSessionOwnerKillResultMsg,
	AiSessionOwnerSchema,
	type AiSessionRuntimeState,
	MsgType,
} from "@shellular/protocol";
import {
	onMessage,
	type SendableMsg,
	sendMessage as sendConnectionMessage,
	sendRequest,
} from "./connection";
import { mergeSessionActivity, seedSessionActivity } from "./sessions";

type AiSessionCreateSendableMsg = Extract<
	SendableMsg,
	{ type: typeof MsgType.AI_SESSION_CREATE }
>;
type AiSessionCreateDraftMsg = Omit<AiSessionCreateSendableMsg, "data"> & {
	data: AiSessionCreateSendableMsg["data"] & {
		configOptions?: AiSessionConfigOption[];
	};
};

export interface InstallationCommand {
	command: string;
	os: string[];
}

export interface AcpAgentInfo {
	id: AiBackend;
	name: string;
	title: string;
	error?: string;
	version?: string;
	enabled?: boolean;
	installed?: boolean;
	source?: "builtin" | "custom";
	available: boolean;
	description?: string;
	icon?: string;
	note?: string;
	capabilities?: Record<string, unknown>;
	adapter?: { command: string; available: boolean };
	state: "unavailable" | "starting" | "ready" | "failed" | "exited";
	installationCommands?: Record<string, InstallationCommand>;
	custom?: CustomAcpAgentInput;
	/**
	 * Config options / slash commands the agent advertised for its most recent
	 * session, cached on the host. ACP only exposes these once a session exists,
	 * so a draft chat uses this to render a real toolbar before the first send.
	 * Advisory: the live session's values replace it as soon as one is created.
	 */
	sessionConfig?: {
		configOptions?: AiSessionConfigOption[];
		availableCommands?: AcpAvailableCommand[];
		modes?: unknown;
		version?: string;
		updatedAt?: number;
	};
}

export type ManagedAcpAgentInfo = AcpAgentInfo & {
	enabled: boolean;
	installed: boolean;
	source: "builtin" | "custom";
};

export interface CustomAcpAgentInput {
	id: string;
	name: string;
	title?: string;
	description?: string;
	icon?: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

interface AgentManagementResult {
	error?: string;
	data?: {
		ok?: boolean;
		agent?: ManagedAcpAgentInfo;
		agents?: ManagedAcpAgentInfo[];
	};
}

export interface AcpSessionListResult {
	agentAvailable: boolean;
	sessions: AiSession[];
	nextCursor?: string;
}

export interface AcpLoadedSession {
	session: AiSession;
	messages: AcpMessage[];
	availableCommands: AcpAvailableCommand[];
	configOptions: AiSessionConfigOption[];
	state?: Record<string, unknown>;
	runtimeState?: AiSessionRuntimeState;
	revision: number;
	syncing?: boolean;
	// Window this payload covers: `from` inclusive, `to` exclusive. The next
	// page back is requested with `to: from`.
	totalCount?: number;
	from?: number;
	to?: number;
	hasMoreBefore?: boolean;
	generation?: number;
}

export interface AcpMessagesPage {
	messages: AcpMessage[];
	from?: number;
	to?: number;
	totalCount?: number;
	hasMoreBefore?: boolean;
	generation?: number;
}

/** Newest-N window requested on attach; older history pages in on scroll. */
/**
 * Messages requested on attach and per scroll-back page.
 *
 * Kept at the chat view's initial render window (`PAGE_SIZE`) rather than above
 * it: anything extra is transferred over the relay and then not displayed. On a
 * 115-message session the 60-message window measured ~376KB and ~3.7s of
 * transit, which dominated attach latency — decode and render of that same
 * payload were ~20ms combined, so the cost is bytes on the wire, not CPU.
 */
export const ATTACH_TAIL = 30;

/**
 * An ACP elicitation surfaced by the CLI as an `elicitation.updated` event —
 * the agent asking the user for structured input (form mode) or to visit a
 * URL (url mode, e.g. sign-in flows). Blocks the agent's turn until answered,
 * exactly like a permission request.
 */
export interface AcpElicitationRequest {
	id: string;
	sessionId: string;
	mode: string;
	message: string;
	requestedSchema?: Record<string, unknown>;
	url?: string;
}

export function readElicitationRequest(
	properties: Record<string, unknown>,
): AcpElicitationRequest | null {
	const id = properties.id;
	const sessionId = properties.sessionId;
	if (typeof id !== "string" || typeof sessionId !== "string") return null;
	const raw = properties.elicitation;
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	return {
		id,
		sessionId,
		mode: typeof record.mode === "string" ? record.mode : "form",
		message: typeof record.message === "string" ? record.message : "",
		requestedSchema:
			record.requestedSchema && typeof record.requestedSchema === "object"
				? (record.requestedSchema as Record<string, unknown>)
				: undefined,
		url: typeof record.url === "string" ? record.url : undefined,
	};
}

// MsgType.AI_ELICITATION_REPLY once the published protocol catches up.
const AI_ELICITATION_REPLY = "ai:elicitation:reply";

/**
 * Fire-and-forget by design: resolution comes back over the event stream
 * (`elicitation.updated` with `resolved: true`), so nothing hangs when the
 * CLI predates elicitation support — the card just stays until dismissed.
 */
export function acpElicitationReply(
	agentId: AiBackend,
	sessionId: string,
	elicitationId: string,
	action: "accept" | "decline" | "cancel",
	content?: Record<string, unknown>,
): void {
	sendConnectionMessage({
		type: AI_ELICITATION_REPLY,
		data: {
			backend: agentId,
			sessionId,
			elicitationId,
			action,
			...(content ? { content } : {}),
		},
	} as SendableMsg);
}

// The published protocol types may trail the CLI's; new optional fields ride
// through the wire regardless (schemas strip unknown keys but the CLI is
// updated first), so read them via this widening until the dep is bumped.
type PagingFields = {
	totalCount?: number;
	from?: number;
	to?: number;
	hasMoreBefore?: boolean;
	generation?: number;
};

type SessionState = Record<string, unknown> | undefined;
type AcpSessionEventMsg = AiEventMsg & {
	data: NonNullable<AiEventMsg["data"]>;
};
export type AcpSessionEvent = AcpSessionEventMsg["data"];

export interface AcpPromptCallbacks {
	onToken: (token: string) => void;
	onMessage: (message: AcpMessage) => void;
	onStatus?: (properties: Record<string, unknown>) => void;
	onUsage?: (usage: Record<string, unknown>) => void;
	onPermission?: (permission: AcpPermissionRequest) => void;
	onEnd: (stopReason?: string) => void;
	onError: (error: string, details?: AcpPromptError) => void;
}

export interface AcpPromptError {
	code: string;
	owner: AiSessionOwner;
}

export function readSessionOwnerError(
	properties: Record<string, unknown>,
): AcpPromptError | null {
	if (properties.errorCode !== "ESESSION_OWNED_BY_PROCESS") return null;
	const details = properties.errorDetails;
	if (!details || typeof details !== "object" || Array.isArray(details)) {
		return null;
	}
	const owner = AiSessionOwnerSchema.safeParse(Reflect.get(details, "owner"));
	return owner.success
		? { code: "ESESSION_OWNED_BY_PROCESS", owner: owner.data }
		: null;
}

export interface AcpQueuedPrompt {
	id: string;
	backend: AiBackend;
	sessionId: string;
	text: string;
	content: AcpContentBlock[];
	createdAt: number;
	updatedAt: number;
}

export interface AcpPermissionRequest {
	id: string;
	sessionId: string;
	callId?: string;
	kind?: string;
	title: string;
	options: unknown[];
	metadata?: unknown;
}

export type { AiSessionConfigOption };

export async function acpListAgents(): Promise<AcpAgentInfo[]> {
	const result = await sendRequest<{
		error?: string;
		data?: { agents?: unknown };
	}>({
		type: MsgType.AI_AGENTS_LIST,
		data: {},
	});
	assertNoError(result);
	return Array.isArray(result.data?.agents)
		? (result.data.agents as AcpAgentInfo[])
		: [];
}

export async function acpManageListAgents(): Promise<ManagedAcpAgentInfo[]> {
	const result = await sendRequest<AgentManagementResult>({
		type: MsgType.AI_AGENTS_MANAGE_LIST,
		data: {},
	});
	assertAgentManagementOk(result);
	return Array.isArray(result.data?.agents) ? result.data.agents : [];
}

export async function acpSetAgentEnabled(
	agentId: AiBackend,
	enabled: boolean,
): Promise<ManagedAcpAgentInfo> {
	const result = await sendRequest<AgentManagementResult>({
		type: MsgType.AI_AGENTS_ENABLE_SET,
		data: { backend: agentId, enabled },
	});
	assertAgentManagementOk(result);
	if (!result.data?.agent) throw new Error("No agent data received");
	return result.data.agent;
}

export async function acpAddCustomAgent(
	input: CustomAcpAgentInput,
): Promise<ManagedAcpAgentInfo> {
	const result = await sendRequest<AgentManagementResult>({
		type: MsgType.AI_AGENTS_CUSTOM_ADD,
		data: input,
	});
	assertAgentManagementOk(result);
	if (!result.data?.agent) throw new Error("No agent data received");
	return result.data.agent;
}

export async function acpUpdateCustomAgent(
	input: CustomAcpAgentInput,
): Promise<ManagedAcpAgentInfo> {
	const result = await sendRequest<AgentManagementResult>({
		type: MsgType.AI_AGENTS_CUSTOM_UPDATE,
		data: input,
	});
	assertAgentManagementOk(result);
	if (!result.data?.agent) throw new Error("No agent data received");
	return result.data.agent;
}

export async function acpRemoveCustomAgent(agentId: AiBackend): Promise<void> {
	const result = await sendRequest<AgentManagementResult>({
		type: MsgType.AI_AGENTS_CUSTOM_REMOVE,
		data: { backend: agentId },
	});
	assertAgentManagementOk(result);
}

export async function acpListSessions(
	agentId: AiBackend,
	workspace?: string,
	agent?: AcpAgentInfo,
	cursor?: string,
): Promise<AcpSessionListResult> {
	const result = await sendRequest<AiSessionListResultMsg>({
		type: MsgType.AI_SESSION_LIST,
		data: {
			backend: agentId,
			...(workspace ? { workspace } : {}),
			...(cursor ? { cursor } : {}),
		},
	});
	assertNoError(result);

	return {
		agentAvailable: agent?.available ?? true,
		nextCursor: result.data?.nextCursor,
		sessions: (result.data?.sessions ?? []).map((session) => ({
			id: session.id,
			model: session.model,
			createdAt: session.createdAt ?? 0,
			title: session.title ?? "Untitled Chat",
			updatedAt: session.updatedAt,
			workspacePath: session.workspacePath ?? "",
		})),
	};
}

export async function acpCreateSession(
	agentId: AiBackend,
	cwd: string,
	prompt = "",
	configOptions?: AiSessionConfigOption[],
): Promise<AcpLoadedSession> {
	const msg: AiSessionCreateDraftMsg = {
		type: MsgType.AI_SESSION_CREATE,
		data: { backend: agentId, prompt, workspacePath: cwd, cwd, configOptions },
	};
	const result = await sendRequest<AiSessionCreateResultMsg>(msg);
	assertNoError(result);
	if (!result.data?.session) throw new Error("No session data received");
	const data = result.data as typeof result.data & { state?: SessionState };
	const state = data.state;
	seedSessionActivity(agentId, result.data.session, data.runtimeState);
	return {
		session: result.data.session,
		messages: [],
		availableCommands: readAvailableCommandsFromState(state) ?? [],
		configOptions: normalizeConfigOptions(
			(result.data.session as { configOptions?: AiSessionConfigOption[] })
				.configOptions,
			state,
		),
		state,
		runtimeState: data.runtimeState,
		revision: 0,
	};
}

export async function acpAttachSession(
	agentId: AiBackend,
	sessionId: string,
	cwd: string,
): Promise<AcpLoadedSession> {
	const result = await sendRequest<AiSessionAttachResultMsg>({
		type: MsgType.AI_SESSION_ATTACH,
		data: { backend: agentId, sessionId, cwd, tail: ATTACH_TAIL },
	} as SendableMsg);
	assertNoError(result);
	if (!result.data) throw new Error("No session data received");
	const data = result.data as typeof result.data & PagingFields;
	seedSessionActivity(agentId, data.session, data.runtimeState);
	return {
		session: data.session,
		messages: data.messages,
		availableCommands:
			data.state?.availableCommands ??
			readAvailableCommands(data.updates) ??
			[],
		configOptions: normalizeConfigOptions(
			data.state?.configOptions as AiSessionConfigOption[] | undefined,
			data.state as SessionState,
		),
		state: data.state as Record<string, unknown> | undefined,
		runtimeState: data.runtimeState,
		revision: data.revision,
		syncing: data.syncing,
		totalCount: data.totalCount,
		from: data.from,
		to: data.to,
		hasMoreBefore: data.hasMoreBefore,
		generation: data.generation,
	};
}

/**
 * Fetch an older window of transcript history for scroll-back: the `limit`
 * messages ending just before `to`, i.e. `[to - limit, to)`. Pass the `from` of
 * the previous window as `to` so pages abut without overlap.
 */
export async function acpMessagesPage(
	agentId: AiBackend,
	sessionId: string,
	to: number,
	limit = ATTACH_TAIL,
): Promise<AcpMessagesPage> {
	const result = await sendRequest<AiMessagesListResultMsg>({
		type: MsgType.AI_MESSAGES_LIST,
		data: { backend: agentId, sessionId, to, limit },
	} as SendableMsg);
	assertNoError(result);
	const data = (result.data ?? { messages: [] }) as NonNullable<
		AiMessagesListResultMsg["data"]
	> &
		PagingFields;
	return {
		messages: (data.messages ?? []) as AcpMessage[],
		from: data.from,
		to: data.to,
		totalCount: data.totalCount,
		hasMoreBefore: data.hasMoreBefore,
		generation: data.generation,
	};
}

export async function acpDetachSession(
	agentId: AiBackend,
	sessionId: string,
): Promise<void> {
	const result = await sendRequest<AiSessionDetachResultMsg>({
		type: MsgType.AI_SESSION_DETACH,
		data: { backend: agentId, sessionId },
	});
	assertNoError(result);
}

export function acpSubscribeSession(
	agentId: AiBackend,
	sessionId: string,
	callbacks: Pick<
		AcpPromptCallbacks,
		"onMessage" | "onStatus" | "onError" | "onPermission"
	> & {
		onEvent?: (event: AcpSessionEvent) => boolean | undefined;
	},
): () => void {
	return onMessage<AiEventMsg>(MsgType.AI_EVENT, (msg) => {
		if (!isSessionEvent(msg, agentId, sessionId)) return;
		mergeSessionActivity(msg.data.state);
		if (callbacks.onEvent?.(msg.data) === false) return;
		if (msg.data.type === "permission.updated") {
			const permission = readPermissionRequest(msg.data.properties);
			if (permission) callbacks.onPermission?.(permission);
			return;
		}
		if (msg.data.type === "session.status") {
			callbacks.onStatus?.(msg.data.properties as Record<string, unknown>);
			return;
		}
		const message = msg.data.properties.message;
		if (message) callbacks.onMessage(message as AcpMessage);
	});
}

export function acpSubscribeSessionEvents(
	agentId: AiBackend,
	sessionId: string,
	callback: (event: AcpSessionEvent) => void,
): () => void {
	return onMessage<AiEventMsg>(MsgType.AI_EVENT, (msg) => {
		if (!isSessionEvent(msg, agentId, sessionId)) return;
		mergeSessionActivity(msg.data.state);
		callback(msg.data);
	});
}

export function acpPrompt(
	agentId: AiBackend,
	sessionId: string,
	text: string,
	callbacks: AcpPromptCallbacks,
	content?: AcpContentBlock[],
): () => void {
	let closed = false;
	const unsubscribe = onMessage<AiEventMsg>(MsgType.AI_EVENT, (msg) => {
		if (closed || !isSessionEvent(msg, agentId, sessionId)) return;
		mergeSessionActivity(msg.data.state);

		if (msg.data.type === "token") {
			const token = msg.data.properties.text;
			if (typeof token === "string") callbacks.onToken(token);
			return;
		}

		if (msg.data.type === "message") {
			// The attached session subscriber owns message reconciliation. Handling
			// the same event here as well creates two consumers for every ACP message.
			return;
		}

		if (msg.data.type === "session.status") {
			callbacks.onStatus?.(msg.data.properties as Record<string, unknown>);
			return;
		}

		if (msg.data.type === "permission.updated") {
			const permission = readPermissionRequest(msg.data.properties);
			if (permission) callbacks.onPermission?.(permission);
			return;
		}

		if (msg.data.type === "error" || msg.data.type === "prompt_error") {
			closed = true;
			unsubscribe();
			callbacks.onError(
				String(msg.data.properties.error ?? "Prompt failed"),
				readSessionOwnerError(msg.data.properties) ?? undefined,
			);
			return;
		}

		if (msg.data.type === "end" || msg.data.type === "cancelled") {
			closed = true;
			unsubscribe();
			const usage = readUsage(msg.data.properties);
			if (usage) callbacks.onUsage?.(usage);
			callbacks.onEnd(readStopReason(msg.data.properties));
		}
	});

	const requestId = `acp_prompt_${Date.now().toString(36)}`;
	const msgId = sendConnectionMessage({
		type: MsgType.AI_PROMPT,
		data: {
			backend: agentId,
			sessionId,
			text,
			content: content?.length ? content : [{ type: "text", text }],
			requestId,
		} as AiPromptMsg["data"],
	} as SendableMsg);

	if (!msgId) {
		closed = true;
		unsubscribe();
		callbacks.onError("Unable to send prompt");
	}

	return () => {
		if (closed) return;
		closed = true;
		unsubscribe();
	};
}

export function acpQueuePrompt(
	agentId: AiBackend,
	sessionId: string,
	text: string,
	content?: AcpContentBlock[],
): void {
	sendConnectionMessage({
		type: MsgType.AI_PROMPT,
		data: {
			backend: agentId,
			sessionId,
			text,
			content: content?.length ? content : [{ type: "text", text }],
		} as AiPromptMsg["data"],
	} as SendableMsg);
}

export async function acpUpdateQueuedPrompt(
	agentId: AiBackend,
	sessionId: string,
	queueId: string,
	text: string,
	content?: AcpContentBlock[],
): Promise<AcpQueuedPrompt[]> {
	const result = await sendRequest<{
		error?: string;
		data?: { queue?: AcpQueuedPrompt[] };
	}>({
		type: MsgType.AI_PROMPT_QUEUE_UPDATE,
		data: {
			backend: agentId,
			sessionId,
			queueId,
			text,
			content: content?.length ? content : [{ type: "text", text }],
		},
	});
	assertNoError(result);
	return result.data?.queue ?? [];
}

export async function acpRemoveQueuedPrompt(
	agentId: AiBackend,
	sessionId: string,
	queueId: string,
): Promise<AcpQueuedPrompt[]> {
	const result = await sendRequest<{
		error?: string;
		data?: { queue?: AcpQueuedPrompt[] };
	}>({
		type: MsgType.AI_PROMPT_QUEUE_REMOVE,
		data: { backend: agentId, sessionId, queueId },
	});
	assertNoError(result);
	return result.data?.queue ?? [];
}

export async function acpSetPromptQueuePaused(
	agentId: AiBackend,
	sessionId: string,
	paused: boolean,
): Promise<AcpQueuedPrompt[]> {
	const result = await sendRequest<{
		error?: string;
		data?: { queue?: AcpQueuedPrompt[] };
	}>({
		type: MsgType.AI_PROMPT_QUEUE_PAUSE,
		data: { backend: agentId, sessionId, paused },
	});
	assertNoError(result);
	return result.data?.queue ?? [];
}

export async function acpPermissionReply(
	agentId: AiBackend,
	sessionId: string,
	permissionId: string,
	optionId: string,
) {
	const result = await sendRequest<AiPermissionReplyAckMsg>({
		type: MsgType.AI_PERMISSION_REPLY,
		data: { backend: agentId, sessionId, permissionId, optionId },
	});
	assertNoError(result);
}

export async function acpCancel(agentId: AiBackend, sessionId: string) {
	const result = await sendRequest<{ error?: string }>({
		type: MsgType.AI_ABORT,
		data: { backend: agentId, sessionId },
	});
	assertNoError(result);
}

export async function acpKillSessionOwner(
	agentId: AiBackend,
	sessionId: string,
): Promise<number> {
	const result = await sendRequest<AiSessionOwnerKillResultMsg>({
		type: MsgType.AI_SESSION_OWNER_KILL,
		data: { backend: agentId, sessionId },
	});
	assertNoError(result);
	if (!result.data?.ok || result.data.pid === undefined) {
		throw new Error("The owning agent process could not be terminated");
	}
	return result.data.pid;
}

export async function acpWriteAttachmentBase64(options: {
	agentId: AiBackend;
	sessionId: string;
	name: string;
	content: string;
	mimeType: string;
}): Promise<NonNullable<AiAttachmentWriteResultMsg["data"]>> {
	const result = await sendRequest<AiAttachmentWriteResultMsg>({
		type: MsgType.AI_ATTACHMENT_WRITE,
		data: {
			backend: options.agentId,
			sessionId: options.sessionId,
			name: options.name,
			content: options.content,
			mimeType: options.mimeType,
			encoding: "base64" as const,
		},
	});
	if (result.error) throw new Error(result.error);
	if (!result.data) throw new Error("No attachment data received");
	return result.data;
}

function readPermissionRequest(
	properties: Record<string, unknown>,
): AcpPermissionRequest | null {
	const id = properties.id;
	const sessionId = properties.sessionId;
	if (typeof id !== "string" || typeof sessionId !== "string") return null;
	return {
		id,
		sessionId,
		callId:
			typeof properties.callId === "string" ? properties.callId : undefined,
		kind: typeof properties.kind === "string" ? properties.kind : undefined,
		title:
			typeof properties.title === "string"
				? properties.title
				: "Permission requested",
		options: Array.isArray(properties.options) ? properties.options : [],
		metadata: properties.metadata,
	};
}

export async function acpSetConfigOption(
	agentId: AiBackend,
	sessionId: string,
	configId: string,
	value: string | boolean,
): Promise<AiSessionConfigOption[]> {
	const result = await sendRequest<AiSessionConfigSetResultMsg>({
		type: MsgType.AI_SESSION_CONFIG_SET,
		data: { backend: agentId, sessionId, configId, value },
	});
	assertNoError(result);
	return result.data?.configOptions ?? [];
}

export async function acpSetMode(
	agentId: AiBackend,
	sessionId: string,
	modeId: string,
): Promise<void> {
	const result = await sendRequest<AiSessionModeSetResultMsg>({
		type: MsgType.AI_SESSION_MODE_SET,
		data: { backend: agentId, sessionId, modeId },
	});
	assertNoError(result);
}

function isSessionEvent(
	msg: AiEventMsg,
	agentId: AiBackend,
	sessionId: string,
): msg is AcpSessionEventMsg {
	return (
		msg.data?.backend === agentId &&
		msg.data.properties?.sessionId === sessionId
	);
}

function assertNoError<T extends { error?: string }>(
	result: T | null | undefined,
): asserts result is T {
	if (!result) throw new Error("No response received");
	if (result.error) throw new Error(result.error);
}

function assertAgentManagementOk(
	result: AgentManagementResult | null | undefined,
): asserts result is AgentManagementResult {
	assertNoError(result);
	if (result.data?.ok === false) {
		throw new Error(result.error || "Agent management request failed");
	}
}

function readAvailableCommands(updates: unknown): AcpAvailableCommand[] | null {
	if (!Array.isArray(updates)) return null;
	for (let index = updates.length - 1; index >= 0; index -= 1) {
		const update = (updates[index] as { update?: unknown }).update as
			| { sessionUpdate?: unknown; availableCommands?: unknown }
			| undefined;
		if (
			update?.sessionUpdate === "available_commands_update" &&
			Array.isArray(update.availableCommands)
		) {
			return update.availableCommands as AcpAvailableCommand[];
		}
	}
	return null;
}

function readStopReason(properties: unknown) {
	if (!properties || typeof properties !== "object") return undefined;
	const stopReason = (properties as { stopReason?: unknown }).stopReason;
	return typeof stopReason === "string" ? stopReason : undefined;
}

function readUsage(properties: unknown): Record<string, unknown> | null {
	if (!properties || typeof properties !== "object") return null;
	const usage = (properties as { usage?: unknown }).usage;
	return usage && typeof usage === "object" && !Array.isArray(usage)
		? (usage as Record<string, unknown>)
		: null;
}

function readAvailableCommandsFromState(
	state: SessionState,
): AcpAvailableCommand[] | null {
	return Array.isArray(state?.availableCommands)
		? (state.availableCommands as AcpAvailableCommand[])
		: null;
}

function normalizeConfigOptions(
	configOptions: AiSessionConfigOption[] | undefined,
	state: SessionState,
): AiSessionConfigOption[] {
	if (Array.isArray(configOptions) && configOptions.length > 0) {
		return configOptions;
	}
	const fallback: AiSessionConfigOption[] = [];
	const modesOption = modeStateToConfigOption(state?.modes);
	if (modesOption) fallback.push(modesOption);
	return fallback;
}

function modeStateToConfigOption(value: unknown): AiSessionConfigOption | null {
	if (!value || typeof value !== "object") return null;
	const state = value as {
		currentModeId?: unknown;
		availableModes?: Array<{
			id?: unknown;
			name?: unknown;
			description?: unknown;
		}>;
	};
	if (typeof state.currentModeId !== "string") return null;
	if (!Array.isArray(state.availableModes)) return null;
	const options = state.availableModes.flatMap((mode) =>
		typeof mode.id === "string"
			? [
					{
						value: mode.id,
						name: typeof mode.name === "string" ? mode.name : mode.id,
						description:
							typeof mode.description === "string"
								? mode.description
								: undefined,
					},
				]
			: [],
	);
	if (!options.length) return null;
	return {
		id: "__mode",
		name: "Mode",
		category: "mode",
		type: "select",
		currentValue: state.currentModeId,
		options,
		_setMethod: "mode",
	} as AiSessionConfigOption;
}
