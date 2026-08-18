import Mascot from "components/Mascot";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import { useEffect, useState } from "react";
import { useShellular } from "state";

// The overlay only ever represents an *interruption of an established session*
// — i.e. the "reconnecting" state. It deliberately does NOT show for:
//   - "connected":    nothing to say.
//   - "connecting":   a fresh connect, already surfaced by the host picker /
//                     scanner ("Connecting…" with their own loaders). A cold
//                     app open sits here or in "disconnected", never an overlay.
//   - "disconnected": idle / user-initiated / reconnect budget exhausted. This
//                     is a terminal state owned by the home view (host picker);
//                     a permanent full-screen "Connection lost" wall would be
//                     wrong and would block the whole app.
// Because phones drop sockets constantly and most reconnects resolve in well
// under a second, we also debounce before revealing, and hide instantly on
// recovery.
const SHOW_DELAY_MS = 700;

// Once a reconnect has failed this many times the host is probably genuinely
// gone (laptop shut, CLI killed) rather than the socket having blipped, and
// riding out the remaining backoff behind a blocking scrim is just an annoyance
// — so we offer an explicit way out. Cancelling drops to `disconnected`, the
// home view's terminal state, where the host picker takes over.
// Note `reconnectAttempt` becomes 1 the moment a reconnect starts, before the
// first attempt has run — so 2 is the first value meaning "an attempt actually
// failed". Gating on 1 would flash the button during blips that resolve in well
// under a second.
const SHOW_CANCEL_AFTER_ATTEMPTS = 2;

// During a CLI self-update the drop is expected, so we don't offer to give up
// straight away. But an update can genuinely fail and never come back, and the
// update reconnect budget runs several minutes — so still surface the escape
// hatch once the restart has clearly overrun the "minute or two" we promised.
const SHOW_CANCEL_AFTER_ATTEMPTS_WHILE_UPDATING = 6;

export default function ConnectionStatus() {
	const { connectionStatus, reconnectAttempt, hostUpdating, disconnect } =
		useShellular();
	const [visible, setVisible] = useState(false);

	const shouldShow = connectionStatus === "reconnecting";
	const canCancel =
		reconnectAttempt >=
		(hostUpdating
			? SHOW_CANCEL_AFTER_ATTEMPTS_WHILE_UPDATING
			: SHOW_CANCEL_AFTER_ATTEMPTS);

	useEffect(() => {
		if (!shouldShow) {
			setVisible(false);
			return;
		}

		const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
		return () => clearTimeout(timer);
	}, [shouldShow]);

	return (
		<LazyMotion features={domAnimation}>
			<AnimatePresence>
				{visible && (
					<m.div
						// Soft, light scrim — the app stays faintly visible underneath so a
						// reconnect feels like a momentary pause rather than a hard wall.
						className="fixed inset-0 z-200 flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_32%,transparent)] px-6 pt-[calc(24px+var(--sat,0px))] pb-[calc(24px+var(--sab,0px))] backdrop-blur-[10px] backdrop-saturate-[1.05]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.28, ease: "easeOut" }}
						aria-live="polite"
						role="status"
					>
						<m.div
							layout
							className="flex max-w-[min(420px,100%)] flex-col rounded-[18px] border border-[var(--popup-border-color,var(--card-border))] bg-[var(--popup-background,var(--surface-soft))] px-5 py-4 shadow-[0_12px_32px_var(--shadow-color),0_2px_8px_var(--shadow-color)]"
							initial={{ opacity: 0, y: 8, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 8, scale: 0.96 }}
							transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
						>
							<div className="flex items-center gap-3.5">
								<Mascot state="loading" size={56} className="shrink-0" />
								<div className="flex min-w-0 flex-col gap-[3px]">
									<p className="m-0 text-base font-bold leading-[1.25] text-accent">
										{hostUpdating ? "Updating CLI…" : "Reconnecting…"}
									</p>
									<p className="m-0 text-[13px] font-medium leading-[1.4] text-secondary-text">
										{hostUpdating
											? canCancel
												? "This is taking longer than usual. The update may have failed."
												: "Your dev machine is restarting after the update. This usually takes a minute or two."
											: canCancel
												? "Still trying. Your dev machine may be offline."
												: "Hang tight, picking up where you left off"}
									</p>
								</div>
							</div>
							<AnimatePresence>
								{canCancel && (
									<m.button
										layout
										type="button"
										className="haptic-trigger mt-3.5 box-border shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[var(--popup-border-color,var(--card-border))] bg-transparent px-4 py-2.5 font-[inherit] text-sm font-semibold leading-[1.2] text-secondary-text transition-[background,color] duration-150 active:bg-[color-mix(in_srgb,var(--primary-text)_8%,transparent)] active:text-primary-text"
										onClick={disconnect}
										initial={{ opacity: 0, scaleY: 0.8 }}
										animate={{ opacity: 1, scaleY: 1 }}
										exit={{ opacity: 0, scaleY: 0.8 }}
										style={{ transformOrigin: "top" }}
										transition={{ duration: 0.24, ease: "easeOut" }}
									>
										Stop reconnecting
									</m.button>
								)}
							</AnimatePresence>
						</m.div>
					</m.div>
				)}
			</AnimatePresence>
		</LazyMotion>
	);
}
