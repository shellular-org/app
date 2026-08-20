import { useEffect, useSyncExternalStore } from "react";
import {
	cancelStartup,
	getStartupSnapshot,
	subscribeStartup,
} from "state/startup";

/**
 * The cancellable strip shown while the startup rule runs. It lives in the
 * Home tab's status slot rather than at the app root, because the rule only
 * ever runs while Home is on screen.
 */
export default function StartupBanner() {
	const { phase, message } = useSyncExternalStore(
		subscribeStartup,
		getStartupSnapshot,
	);

	// TabView renders only the active tab, so leaving Home unmounts this and
	// cancels the sequence. Someone who has started doing something else should
	// not get a chat opened on top of them. A pushed page does not unmount the
	// tab view, so opening the target does not cancel itself.
	useEffect(() => cancelStartup, []);

	if (phase !== "connecting" && phase !== "opening") return null;

	return (
		<div
			className="mx-4 mb-3 flex items-center gap-3 rounded-2xl border border-card-border bg-popup-background px-4 py-3 shadow-[var(--shadow)]"
			role="status"
			aria-live="polite"
		>
			<span
				className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 truncate text-[13px] text-primary-text">
				{message}
			</span>
			<button
				type="button"
				className="haptic-trigger shrink-0 rounded-lg px-2 py-1 text-[12px] font-bold text-secondary-text transition-colors duration-150 active:text-primary-text"
				onClick={cancelStartup}
			>
				Cancel
			</button>
		</div>
	);
}
