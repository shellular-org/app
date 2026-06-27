import "./style.scss";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import {
	type AccountHistory,
	type DeviceHistory,
	loadAccountHistory,
} from "lib/accountHistory";
import { useEffect, useState } from "react";

export default function AccountHistoryPage() {
	const [history, setHistory] = useState<AccountHistory | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		loadAccountHistory()
			.then((nextHistory) => {
				if (!cancelled) setHistory(nextHistory);
			})
			.catch((err) => {
				if (!cancelled) {
					setError(errorMessage(err));
					setHistory(null);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<Page title="History" className="account-history-page">
			{loading ? (
				<EmptyState mascot="loading" message="loading history..." />
			) : error ? (
				<EmptyState mascot="error" message={error} />
			) : (
				<div className="account-history-content">
					<section className="account-history-section">
						<h2>Hosts</h2>
						<div className="account-history-list">
							{history?.hosts.length ? (
								history.hosts.map((host) => (
									<div key={host.hostId} className="account-history-row">
										<span className="icon-server" aria-hidden="true" />
										<span className="account-history-row-text">
											<span className="account-history-row-title">
												{host.platform
													? `${host.platform} host`
													: "Shellular host"}
											</span>
											<span className="account-history-row-meta">
												{host.hostId} - {formatSeenAt(host.lastSeenAt)}
											</span>
										</span>
										<span className="account-history-count">
											{host.connectionCount}
										</span>
									</div>
								))
							) : (
								<HistoryEmptyRow icon="icon-server" text="No hosts yet" />
							)}
						</div>
					</section>

					<section className="account-history-section">
						<h2>Devices</h2>
						<div className="account-history-list">
							{history?.devices.length ? (
								history.devices.map((device) => (
									<div key={device.clientId} className="account-history-row">
										<span
											className={deviceIcon(device.platform)}
											aria-hidden="true"
										/>
										<span className="account-history-row-text">
											<span className="account-history-row-title">
												{device.deviceManufacturer} {device.deviceModel}
											</span>
											<span className="account-history-row-meta">
												{device.platform}
												{device.deviceIsEmulator ? " emulator" : ""} -{" "}
												{device.appVersion} - {formatSeenAt(device.lastSeenAt)}
											</span>
										</span>
										<span className="account-history-count">
											{device.connectionCount}
										</span>
									</div>
								))
							) : (
								<HistoryEmptyRow icon="icon-smartphone" text="No devices yet" />
							)}
						</div>
					</section>
				</div>
			)}
		</Page>
	);
}

function HistoryEmptyRow({ icon, text }: { icon: string; text: string }) {
	return (
		<div className="account-history-row account-history-row--empty">
			<span className={icon} aria-hidden="true" />
			<span className="account-history-row-text">
				<span className="account-history-row-title">{text}</span>
				<span className="account-history-row-meta">History only</span>
			</span>
		</div>
	);
}

function deviceIcon(platform: DeviceHistory["platform"]): string {
	switch (platform) {
		case "browser":
			return "icon-monitor";
		case "ios":
			return "icon-smartphone";
		case "android":
			return "icon-smartphone";
	}
}

function formatSeenAt(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
