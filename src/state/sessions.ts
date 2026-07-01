import type {
	AiActivityListResultMsg,
	AiEventMsg,
	AiSession,
	AiSessionRuntimeState,
	AiSessionRuntimeStatus,
} from "@shellular/protocol";
import { MsgType } from "@shellular/protocol";
import {
	getConnectionSnapshot,
	onMessage,
	sendRequest,
	subscribeState,
} from "./connection";

type StreamingListener = (
	agentId: string,
	sessionId: string,
	streaming: boolean,
) => void;
type ActivityListener = () => void;

export type SessionActivity = AiSessionRuntimeState & {
	visibleUntil?: number;
};

const RECENT_ACTIVITY_MS = 10 * 60 * 1000;
const LIVE_STATUSES = new Set<AiSessionRuntimeStatus>([
	"starting",
	"running",
	"waiting_for_permission",
	"stopping",
]);
// Generic placeholders various code paths inject when a real title is unknown.
// These must never overwrite a real title we already have for a session.
const PLACEHOLDER_TITLES = new Set(["New Chat", "Untitled Chat"]);

function isRealTitle(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		!PLACEHOLDER_TITLES.has(value.trim())
	);
}

/** Picks the first real (non-placeholder) title from the candidates. */
function resolveTitle(
	...candidates: (string | undefined)[]
): string | undefined {
	for (const candidate of candidates) {
		if (isRealTitle(candidate)) return candidate;
	}
	// No real title anywhere: keep a placeholder only if one was provided, so the
	// chat page's own fallback still works.
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.length > 0) return candidate;
	}
	return undefined;
}

const streamingListeners = new Set<StreamingListener>();
const activityListeners = new Set<ActivityListener>();
const activities = new Map<string, SessionActivity>();

let onMessageCleanup = () => {};
let pruneTimer = 0;
let activeSessionToken = "";
let connectionSubscribed = false;
let hydrationRequestId = 0;

export function listenToSessionStreamingEvent(listener: StreamingListener) {
	streamingListeners.add(listener);
	return () => {
		streamingListeners.delete(listener);
	};
}

export function subscribeSessionActivities(listener: ActivityListener) {
	activityListeners.add(listener);
	return () => {
		activityListeners.delete(listener);
	};
}

export function getSessionActivity(
	agentId: string,
	sessionId: string,
): SessionActivity | undefined {
	return activities.get(activityKey(agentId, sessionId));
}

export function getActiveSessionActivities(
	agentId?: string,
): SessionActivity[] {
	const now = Date.now();
	return [...activities.values()]
		.filter((activity) => {
			if (agentId && activity.agentId !== agentId) return false;
			if (isLiveStatus(activity.status)) return true;
			// Persistent activities stay until explicitly dismissed.
			if (activity.persistent) return true;
			return Boolean(activity.visibleUntil && now <= activity.visibleUntil);
		})
		.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mergeSessionActivity(
	state: AiSessionRuntimeState | undefined,
): SessionActivity | undefined {
	if (!state?.agentId || !state.sessionId) return undefined;
	const existing = getSessionActivity(state.agentId, state.sessionId);
	return setActivity(state.agentId, state.sessionId, {
		status: state.status,
		agentId: state.agentId,
		sessionId: state.sessionId,
		updatedAt: state.updatedAt,
		// Never let a placeholder/empty title overwrite a real one we already have.
		title: resolveTitle(state.title, existing?.title),
		workspacePath: state.workspacePath ?? existing?.workspacePath,
		model: state.model ?? existing?.model,
		message: state.message ?? existing?.message,
		stopReason: state.stopReason ?? existing?.stopReason,
		error: state.error ?? existing?.error,
		pendingPermission: state.pendingPermission ?? existing?.pendingPermission,
		external: state.external ?? existing?.external,
		persistent: state.persistent ?? existing?.persistent,
		// Persistent (e.g. externally-observed) finished sessions stay until the
		// user dismisses them, so they never get a visibility expiry.
		...(isLiveStatus(state.status) || state.persistent
			? { visibleUntil: undefined }
			: { visibleUntil: Date.now() + RECENT_ACTIVITY_MS }),
	});
}

export function seedSessionActivity(
	agentId: string,
	session: Pick<
		AiSession,
		"id" | "title" | "workspacePath" | "model" | "updatedAt"
	>,
	runtimeState?: AiSessionRuntimeState,
): SessionActivity | undefined {
	if (!session.id) return undefined;
	const existing = getSessionActivity(agentId, session.id);
	const shouldShowRuntimeState =
		runtimeState &&
		!isLiveStatus(runtimeState.status) &&
		Boolean(runtimeState.message);
	return setActivity(agentId, session.id, {
		status: existing?.status ?? runtimeState?.status ?? "stopped",
		agentId,
		sessionId: session.id,
		updatedAt:
			existing?.updatedAt ??
			runtimeState?.updatedAt ??
			session.updatedAt ??
			Date.now(),
		// Prefer any REAL title (existing first, so opening a session whose load
		// response only carries a placeholder like "Untitled Chat" doesn't stomp
		// the real watcher-provided title). Fall back to a placeholder only if no
		// real title exists anywhere.
		title: resolveTitle(existing?.title, runtimeState?.title, session.title),
		workspacePath:
			session.workspacePath ??
			runtimeState?.workspacePath ??
			existing?.workspacePath,
		model: session.model ?? runtimeState?.model ?? existing?.model,
		message: runtimeState?.message ?? existing?.message,
		stopReason: runtimeState?.stopReason ?? existing?.stopReason,
		error: runtimeState?.error ?? existing?.error,
		pendingPermission:
			runtimeState?.pendingPermission ?? existing?.pendingPermission,
		visibleUntil: shouldShowRuntimeState
			? Date.now() + RECENT_ACTIVITY_MS
			: existing?.visibleUntil,
	});
}

/**
 * Removes an activity from the home view and tells the CLI to forget it, so a
 * finished/observed session the user has acknowledged does not reappear.
 */
export function dismissSessionActivity(agentId: string, sessionId: string) {
	const key = activityKey(agentId, sessionId);
	const existing = activities.get(key);
	if (existing) {
		activities.delete(key);
		emitStreaming(agentId, sessionId, false);
		emitActivities();
	}
	void sendRequest({
		type: MsgType.AI_ACTIVITY_DISMISS,
		data: { backend: agentId, sessionId },
	}).catch(() => {});
}

export function getStreamingSessions(agentId: string) {
	return new Set(
		getActiveSessionActivities(agentId)
			.filter((activity) => isStreamingActivity(activity))
			.map((activity) => activity.sessionId),
	);
}

export function getSessionStreaming(
	agentId: string,
	sessionId: string,
): boolean {
	const activity = getSessionActivity(agentId, sessionId);
	return activity ? isStreamingActivity(activity) : false;
}

export function getAgentStreaming(agentId: string): boolean {
	return getActiveSessionActivities(agentId).some(isStreamingActivity);
}

export function getHasAnyStreaming(): boolean {
	return getActiveSessionActivities().some(isStreamingActivity);
}

export function setSessionStreaming(
	agentId: string,
	sessionId: string,
	streaming: boolean,
) {
	if (!agentId || !sessionId) return;
	setActivity(agentId, sessionId, {
		agentId,
		sessionId,
		status: streaming ? "running" : "finished",
		message: streaming ? "Working" : "Finished",
		updatedAt: Date.now(),
		visibleUntil: streaming ? undefined : Date.now() + RECENT_ACTIVITY_MS,
	});
}

export function setupSessionStateListeners() {
	onMessageCleanup();
	if (!connectionSubscribed) {
		connectionSubscribed = true;
		subscribeState(setupSessionStateListeners);
	}

	const { connectionStatus, sessionToken } = getConnectionSnapshot();
	if (
		connectionStatus === "reconnecting" ||
		connectionStatus === "connecting"
	) {
		hydrationRequestId += 1;
		return;
	}

	if (connectionStatus !== "connected") {
		hydrationRequestId += 1;
		activeSessionToken = "";
		clearActivities();
		return;
	}

	if (activeSessionToken !== sessionToken) {
		hydrationRequestId += 1;
		activeSessionToken = sessionToken;
		clearActivities();
	}

	void hydrateActivitiesFromCli(++hydrationRequestId);

	onMessageCleanup = onMessage<AiEventMsg>(MsgType.AI_EVENT, ({ data }) => {
		if (!data) return;

		const { backend, type } = data;
		const sessionId = data.properties?.sessionId;

		// An externally-observed session whose agent process exited: drop it.
		if (type === "session.removed" && backend && sessionId) {
			removeActivity(backend, sessionId);
			return;
		}

		if (data.state) {
			mergeSessionActivity(data.state);
			return;
		}

		if (!backend || !sessionId) return;

		const fallback = fallbackActivityFromEvent(backend, sessionId, type, data);
		if (fallback) setActivity(backend, sessionId, fallback);
	});
}

async function hydrateActivitiesFromCli(requestId: number) {
	const result = await sendRequest<AiActivityListResultMsg>({
		type: MsgType.AI_ACTIVITY_LIST,
		data: {},
	});
	if (requestId !== hydrationRequestId) return;
	if (result.error || !result.data?.activities) return;
	replaceActivities(result.data.activities);
}

function removeActivity(agentId: string, sessionId: string) {
	const key = activityKey(agentId, sessionId);
	if (!activities.has(key)) return;
	activities.delete(key);
	emitStreaming(agentId, sessionId, false);
	emitActivities();
}

function setActivity(
	agentId: string,
	sessionId: string,
	next: SessionActivity,
): SessionActivity {
	const key = activityKey(agentId, sessionId);
	const previous = activities.get(key);
	const activity = {
		...previous,
		...next,
		agentId,
		sessionId,
		updatedAt: next.updatedAt ?? Date.now(),
	};
	if (isLiveStatus(activity.status)) {
		delete activity.visibleUntil;
	}
	if (activity.status !== "waiting_for_permission") {
		delete activity.pendingPermission;
	}
	activities.set(key, activity);
	emitActivity(activity, previous);
	schedulePrune();
	return activity;
}

function clearActivities() {
	if (!activities.size) return;
	const previous = [...activities.values()];
	activities.clear();
	for (const activity of previous) {
		emitStreaming(activity.agentId, activity.sessionId, false);
	}
	emitActivities();
}

function replaceActivities(nextActivities: AiSessionRuntimeState[]) {
	const previousStreaming = new Map<
		string,
		{ agentId: string; sessionId: string; streaming: boolean }
	>();
	for (const activity of activities.values()) {
		previousStreaming.set(activityKey(activity.agentId, activity.sessionId), {
			agentId: activity.agentId,
			sessionId: activity.sessionId,
			streaming: isStreamingActivity(activity),
		});
	}

	activities.clear();
	for (const state of nextActivities) {
		if (!state.agentId || !state.sessionId) continue;
		activities.set(activityKey(state.agentId, state.sessionId), {
			...state,
			...(isLiveStatus(state.status) || state.persistent
				? { visibleUntil: undefined }
				: { visibleUntil: state.updatedAt + RECENT_ACTIVITY_MS }),
		});
	}

	for (const [key, previous] of previousStreaming) {
		const activity = activities.get(key);
		const streaming = activity ? isStreamingActivity(activity) : false;
		if (previous.streaming !== streaming) {
			emitStreaming(previous.agentId, previous.sessionId, streaming);
		}
	}

	for (const activity of activities.values()) {
		const key = activityKey(activity.agentId, activity.sessionId);
		if (!previousStreaming.has(key) && isStreamingActivity(activity)) {
			emitStreaming(activity.agentId, activity.sessionId, true);
		}
	}

	emitActivities();
	schedulePrune();
}

function fallbackActivityFromEvent(
	agentId: string,
	sessionId: string,
	type: string,
	msg: NonNullable<AiEventMsg["data"]>,
): SessionActivity | null {
	const properties = msg.properties ?? {};
	switch (type) {
		case "token":
		case "message":
			return {
				agentId,
				sessionId,
				status: "running",
				message: "Working",
				updatedAt: Date.now(),
			};
		case "permission.updated":
			return {
				agentId,
				sessionId,
				status: "waiting_for_permission",
				message: "Waiting for permission",
				pendingPermission: properties,
				updatedAt: Date.now(),
			};
		case "cancelled":
			return {
				agentId,
				sessionId,
				status: "cancelled",
				message: "Cancelled",
				stopReason: "cancelled",
				updatedAt: Date.now(),
				visibleUntil: Date.now() + RECENT_ACTIVITY_MS,
			};
		case "end": {
			const stopReason = properties.stopReason;
			const cancelled = stopReason === "cancelled";
			return {
				agentId,
				sessionId,
				status: cancelled ? "cancelled" : "finished",
				message: cancelled ? "Cancelled" : "Finished",
				stopReason: typeof stopReason === "string" ? stopReason : undefined,
				updatedAt: Date.now(),
				visibleUntil: Date.now() + RECENT_ACTIVITY_MS,
			};
		}
		case "error":
		case "prompt_error": {
			const error = properties.error;
			return {
				agentId,
				sessionId,
				status: "error",
				message: "Error",
				error: typeof error === "string" ? error : undefined,
				updatedAt: Date.now(),
				visibleUntil: Date.now() + RECENT_ACTIVITY_MS,
			};
		}
		default:
			return null;
	}
}

function schedulePrune() {
	if (pruneTimer) window.clearTimeout(pruneTimer);
	pruneTimer = window.setTimeout(
		pruneInactiveActivities,
		RECENT_ACTIVITY_MS + 500,
	);
}

function pruneInactiveActivities() {
	pruneTimer = 0;
	const now = Date.now();
	let changed = false;
	for (const [key, activity] of activities) {
		if (isLiveStatus(activity.status)) continue;
		if (activity.persistent) continue;
		if (activity.visibleUntil && now <= activity.visibleUntil) continue;
		activities.delete(key);
		emitStreaming(activity.agentId, activity.sessionId, false);
		changed = true;
	}
	if (changed) emitActivities();
	if (activities.size) schedulePrune();
}

function isStreamingActivity(activity: SessionActivity) {
	return isLiveStatus(activity.status);
}

function isLiveStatus(status: AiSessionRuntimeStatus) {
	return LIVE_STATUSES.has(status);
}

/**
 * A session status is "settled" once it is no longer live — i.e. the turn has
 * genuinely finished/stopped/errored/cancelled and is not merely `running` or
 * `waiting_for_permission`. Consumers use this to know a pending permission has
 * been resolved rather than still being mid-turn.
 */
export function isSettledSessionStatus(status: AiSessionRuntimeStatus) {
	return !LIVE_STATUSES.has(status);
}

function activityKey(agentId: string, sessionId: string) {
	return `${agentId}:${sessionId}`;
}

function emitActivity(activity: SessionActivity, previous?: SessionActivity) {
	const wasStreaming = previous ? isStreamingActivity(previous) : false;
	const streaming = isStreamingActivity(activity);
	if (wasStreaming !== streaming || !previous) {
		emitStreaming(activity.agentId, activity.sessionId, streaming);
	}
	emitActivities();
}

function emitStreaming(agentId: string, sessionId: string, streaming: boolean) {
	for (const listener of Array.from(streamingListeners)) {
		listener(agentId, sessionId, streaming);
	}
}

function emitActivities() {
	for (const listener of Array.from(activityListeners)) {
		listener();
	}
}
