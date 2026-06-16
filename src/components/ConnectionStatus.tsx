import "./ConnectionStatus.scss";
import Mascot from "components/Mascot";
import { AnimatePresence, motion } from "framer-motion";
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

export default function ConnectionStatus() {
	const { connectionStatus } = useShellular();
	const [visible, setVisible] = useState(false);

	const shouldShow = connectionStatus === "reconnecting";

	useEffect(() => {
		if (!shouldShow) {
			setVisible(false);
			return;
		}

		const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
		return () => clearTimeout(timer);
	}, [shouldShow]);

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					className="connection-status is-connecting"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.28, ease: "easeOut" }}
					aria-live="polite"
					role="status"
				>
					<motion.div
						className="connection-status-card"
						initial={{ opacity: 0, y: 8, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 8, scale: 0.96 }}
						transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
					>
						<Mascot state="loading" size={56} />
						<div className="connection-status-text">
							<p className="connection-status-message">Reconnecting…</p>
							<p className="connection-status-hint">
								Hang tight, picking up where you left off
							</p>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
