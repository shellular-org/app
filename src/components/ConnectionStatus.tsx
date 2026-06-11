import "./ConnectionStatus.scss";
import Mascot from "components/Mascot";
import { AnimatePresence, motion } from "framer-motion";
import { useShellular } from "state";

export default function ConnectionStatus() {
	const { connectionStatus } = useShellular();

	const show = connectionStatus !== "connected";
	const isConnecting =
		connectionStatus === "connecting" || connectionStatus === "reconnecting";
	const mascotState = isConnecting ? "loading" : "error";
	const message =
		connectionStatus === "reconnecting"
			? "Reconnecting..."
			: isConnecting
				? "Connecting..."
				: "Disconnected";

	return (
		<AnimatePresence>
			{show && (
				<motion.div
					className={`connection-status ${
						isConnecting ? "is-connecting" : "is-disconnected"
					}`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.35, ease: "easeOut" }}
					aria-live="polite"
					role="status"
				>
					<Mascot state={mascotState} size={48} />
					<div className="flex flex-col">
						<p className="connection-status-message">{message}</p>
						{!isConnecting && (
							<p className="connection-status-hint">
								Check your connection and try again
							</p>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
