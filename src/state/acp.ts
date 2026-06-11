import {
	type AcpAvailableCommand,
	type AcpContentBlock,
	type AcpMessage,
	type AiAttachmentWriteResultMsg,
	type AiBackend,
	type AiEventMsg,
	type AiPermissionReplyAckMsg,
	type AiPromptMsg,
	type AiSession,
	type AiSessionAttachResultMsg,
	type AiSessionConfigOption,
	type AiSessionConfigSetResultMsg,
	type AiSessionCreateResultMsg,
	type AiSessionDetachResultMsg,
	type AiSessionListResultMsg,
	type AiSessionLoadResultMsg,
	type AiSessionModelSetResultMsg,
	type AiSessionModeSetResultMsg,
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
}

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
	onError: (error: string) => void;
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
): Promise<AcpLoadedSession> {
	const result = await sendRequest<AiSessionCreateResultMsg>({
		type: MsgType.AI_SESSION_CREATE,
		data: { backend: agentId, prompt, workspacePath: cwd, cwd },
	});
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
		data: { backend: agentId, sessionId, cwd },
	});
	assertNoError(result);
	if (!result.data) throw new Error("No session data received");
	seedSessionActivity(agentId, result.data.session, result.data.runtimeState);
	return {
		session: result.data.session,
		messages: result.data.messages,
		availableCommands:
			result.data.state?.availableCommands ??
			readAvailableCommands(result.data.updates) ??
			[],
		configOptions: normalizeConfigOptions(
			result.data.state?.configOptions as AiSessionConfigOption[] | undefined,
			result.data.state as SessionState,
		),
		state: result.data.state as Record<string, unknown> | undefined,
		runtimeState: result.data.runtimeState,
		revision: result.data.revision,
		syncing: result.data.syncing,
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

export async function acpLoadSession(
	agentId: AiBackend,
	sessionId: string,
	cwd: string,
): Promise<AcpLoadedSession> {
	const result = await sendRequest<AiSessionLoadResultMsg>({
		type: MsgType.AI_SESSION_LOAD,
		data: { backend: agentId, sessionId, cwd },
	});
	assertNoError(result);
	if (!result.data) throw new Error("No session data received");
	seedSessionActivity(agentId, result.data.session, result.data.runtimeState);
	return {
		session: result.data.session,
		messages: result.data.messages,
		availableCommands:
			result.data.state?.availableCommands ??
			readAvailableCommands(result.data.updates) ??
			[],
		configOptions: normalizeConfigOptions(
			result.data.state?.configOptions as AiSessionConfigOption[] | undefined,
			result.data.state as SessionState,
		),
		state: result.data.state as Record<string, unknown> | undefined,
		runtimeState: result.data.runtimeState,
		revision: 0,
	};
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
			const message = msg.data.properties.message;
			if (message) callbacks.onMessage(message as AcpMessage);
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
			callbacks.onError(String(msg.data.properties.error ?? "Prompt failed"));
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

export async function acpSetModel(
	agentId: AiBackend,
	sessionId: string,
	modelId: string,
): Promise<void> {
	const result = await sendRequest<AiSessionModelSetResultMsg>({
		type: MsgType.AI_SESSION_MODEL_SET,
		data: { backend: agentId, sessionId, modelId },
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
	const modelsOption = modelStateToConfigOption(state?.models);
	if (modelsOption) fallback.push(modelsOption);
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

function modelStateToConfigOption(
	value: unknown,
): AiSessionConfigOption | null {
	if (!value || typeof value !== "object") return null;
	const state = value as {
		currentModelId?: unknown;
		availableModels?: Array<{
			modelId?: unknown;
			id?: unknown;
			name?: unknown;
			displayName?: unknown;
			description?: unknown;
		}>;
	};
	if (typeof state.currentModelId !== "string") return null;
	if (!Array.isArray(state.availableModels)) return null;
	const options = state.availableModels.flatMap((model) => {
		const value =
			typeof model.modelId === "string"
				? model.modelId
				: typeof model.id === "string"
					? model.id
					: null;
		if (!value) return [];
		return [
			{
				value,
				name:
					typeof model.name === "string"
						? model.name
						: typeof model.displayName === "string"
							? model.displayName
							: value,
				description:
					typeof model.description === "string" ? model.description : undefined,
			},
		];
	});
	if (!options.length) return null;
	return {
		id: "__model",
		name: "Model",
		category: "model",
		type: "select",
		currentValue: state.currentModelId,
		options,
		_setMethod: "model",
	} as AiSessionConfigOption;
}
