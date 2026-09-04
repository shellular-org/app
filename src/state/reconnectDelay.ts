const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 4_000, 8_000, 16_000];

/**
 * Return the delay before a reconnect attempt. Explicit recovery actions such
 * as app resume and network-online bypass backoff for their first attempt.
 */
export function getReconnectDelayMs(
	attempt: number,
	immediate = false,
	random = Math.random,
): number {
	if (immediate) return 0;

	const base =
		RECONNECT_DELAYS_MS[
			Math.max(Math.min(attempt - 1, RECONNECT_DELAYS_MS.length - 1), 0)
		];

	// Jitter (±20%) keeps clients disconnected by the same relay event from
	// retrying in lockstep.
	return base * (0.8 + random() * 0.4);
}
