import { type ReactNode, useState } from "react";
import OfflineBanner from "./OfflineBanner";
import "./EmptyState.scss";
import { getOnlineStatus } from "lib/utils";
import Mascot, { type MascotState } from "./Mascot";

interface Props {
	message: string;
	action?: ReactNode;
	children?: ReactNode;
	mascot?: MascotState | false;
}

export default function EmptyState({
	message,
	action,
	children,
	mascot,
}: Props) {
	const [isOnline, setIsOnline] = useState(getOnlineStatus());

	return (
		<div className="empty-state">
			<OfflineBanner onChange={setIsOnline} />

			{isOnline && (
				<>
					{children ??
						(mascot !== false && (
							<Mascot state={mascot ?? "idle"} size={80} label={message} />
						))}
					<p className="empty-state-message">{message}</p>
					{action}
				</>
			)}
		</div>
	);
}
