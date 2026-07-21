import dialog from "bridge/dialog";
import AppMenu from "components/AppMenu";
import Loader from "components/Loader";
import { formatConnectionString } from "lib/e2ee";
import { upsertSavedHost } from "lib/machines";
import { formatRelativeTime, getPlatformIcon } from "lib/utils";
import { useCallback, useState } from "react";
import { type SavedHost, useShellular } from "state";
import { getConnectionSnapshot, getHostInfo } from "state/connection";
import HostQrSheet from "./HostQrSheet";

interface SavedHostProps {
	host: SavedHost;
}

export default function SavedHostItem({ host }: SavedHostProps) {
	const { removeSavedHost, connect, switchDevice, disconnect } = useShellular();
	const [hostname, setHostname] = useState(host.alias || host.hostname);
	const [showQr, setShowQr] = useState(false);

	const hostInfo = getHostInfo();
	const { connectionStatus, sessionToken } = getConnectionSnapshot();
	const connected = connectionStatus === "connected";
	const connecting = connectionStatus === "connecting";
	const isActive = connected && hostInfo?.id === host.hostId;
	const thisHostConnecting = connecting && host.hostId === sessionToken;

	const statusClass = isActive
		? "saved-machine-item--active"
		: thisHostConnecting
			? "saved-machine-item--connecting"
			: "";
	const handleConnect = useCallback(() => {
		const token = formatConnectionString(host.hostId, host.encryptionKey);
		const onerror = (err: Error) => {
			dialog.message(err.message, "Connection Error!");
		};

		if (connected) {
			switchDevice(token).catch(onerror);
			return;
		}

		connect(token).catch(onerror);
	}, [connect, switchDevice, connected, host]);

	return (
		<div
			key={host.hostId}
			className={`saved-machine-item ${statusClass}`.trim()}
		>
			<button
				type="button"
				className={"saved-machine-connect-btn haptic-trigger"}
				onClick={handleConnect}
				disabled={connecting || isActive}
			>
				<span
					className={`${getPlatformIcon(host.platform)} saved-machine-icon`}
					aria-hidden="true"
				/>
				<div className="saved-machine-info">
					<span className="saved-machine-hostname">
						{host.alias ? host.alias : `${host.username}@${host.hostname}`}
					</span>
					<span className="saved-machine-meta">
						{formatRelativeTime(host.lastConnected)}
						{host.alias && ` • ${host.username}@${host.hostname}`}
					</span>
				</div>
				{thisHostConnecting && <Loader size={18} />}
			</button>
			<AppMenu
				buttonClassName="saved-machine-more-btn haptic-trigger"
				ariaLabel={`Menu for ${hostname}`}
				disabled={connecting}
				items={[
					{
						icon: "icon-edit",
						label: "Rename",
						onClick: async () => {
							const newName = await dialog.textInput(
								"Enter a new name for this host",
								hostname,
								"Rename Host",
							);
							if (newName?.trim()) {
								setHostname(newName.trim());
								host.alias = newName.trim();
								upsertSavedHost(host);
							}
						},
					},
					{
						icon: "icon-qr_code_scanner",
						label: "Show Connection QR",
						onClick: async () => {
							// This QR is a bearer credential that doesn't expire, so
							// confirm intent before putting it on screen.
							const ok = await dialog.confirm(
								`Keep this QR code private — do not share it with anyone.`,
								"Show Connection QR",
							);
							if (!ok) return;
							setShowQr(true);
						},
					},
					{
						icon: "icon-trash",
						label: "Remove",
						danger: true,
						onClick: async () => {
							const ok = await dialog.confirm(
								`Remove "${hostname}" from saved hosts?`,
								"Remove Device",
							);
							if (!ok) return;

							disconnect();
							removeSavedHost(host.hostId);
						},
					},
				]}
			>
				<span className="icon-more-vertical" aria-hidden="true" />
			</AppMenu>
			<HostQrSheet host={host} open={showQr} onClose={() => setShowQr(false)} />
		</div>
	);
}
