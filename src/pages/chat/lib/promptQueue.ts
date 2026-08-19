export interface PromptQueueDecision {
	sessionId: string;
	sessionIsStreaming: boolean;
	queuedSessionIds: readonly string[];
}

export interface QueuePromptIdentity {
	id: string;
	sessionId: string;
}

export interface DirectPromptDispatch {
	sessionId: string;
}

/**
 * The CLI emits a temporary message when it accepts a queued prompt. It is
 * represented in the composer queue until the prompt is actually dispatched,
 * so it must not also be rendered as a transcript message.
 */
export function isQueuedPromptPlaceholderId(id: unknown): boolean {
	return typeof id === "string" && id.startsWith("prompt_queue_");
}

export interface PromptQueueVisibility<T extends QueuePromptIdentity> {
	visibleItems: T[];
	directDispatch: DirectPromptDispatch | null;
	immediatelyClaimedIds: Set<string>;
}

/**
 * Queue only behind work that still exists. The queue runner's `running` event
 * can arrive or settle a render later than its final item, so it is not a safe
 * signal for deciding how a newly submitted prompt should be dispatched.
 */
export function shouldQueuePrompt({
	sessionId,
	sessionIsStreaming,
	queuedSessionIds,
}: PromptQueueDecision): boolean {
	return sessionIsStreaming || queuedSessionIds.includes(sessionId);
}

/**
 * The CLI intentionally inserts every prompt into its internal queue before
 * draining it. When the queue was idle, that first item is execution handoff,
 * not waiting work, and should not flash in the editable queue strip.
 */
export function findImmediatelyClaimedPromptId(
	items: readonly QueuePromptIdentity[],
	running: boolean,
	directDispatch: DirectPromptDispatch | null,
): string | undefined {
	if (running || !directDispatch || items.length !== 1) return undefined;
	const item = items[0];
	return item.sessionId === directDispatch.sessionId ? item.id : undefined;
}

/** Reconcile one CLI queue event into the queue users can actually manage. */
export function reconcilePromptQueueVisibility<T extends QueuePromptIdentity>(
	items: readonly T[],
	running: boolean,
	directDispatch: DirectPromptDispatch | null,
	immediatelyClaimedIds: ReadonlySet<string>,
): PromptQueueVisibility<T> {
	const nextClaimedIds = new Set(immediatelyClaimedIds);
	const claimedId = findImmediatelyClaimedPromptId(
		items,
		running,
		directDispatch,
	);
	if (claimedId) nextClaimedIds.add(claimedId);

	const liveIds = new Set(items.map((item) => item.id));
	const visibleItems = items.filter((item) => !nextClaimedIds.has(item.id));
	for (const id of nextClaimedIds) {
		if (!liveIds.has(id)) nextClaimedIds.delete(id);
	}

	return {
		visibleItems,
		// Once the runner is already busy or multiple items exist, this dispatch is
		// genuine waiting work and must never be mistaken for a later idle handoff.
		directDispatch:
			claimedId || running || items.length > 1 ? null : directDispatch,
		immediatelyClaimedIds: nextClaimedIds,
	};
}
