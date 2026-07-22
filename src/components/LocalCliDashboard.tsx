import localCli from "bridge/localCli";
import { copyToClipboard } from "lib/clipboard";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
	getLocalCliSnapshot,
	initializeLocalCli,
	setLocalClientApproval,
	subscribeLocalCli,
} from "state/localCli";

export default function LocalCliDashboard() {
	const { cli, busy, error } = useSyncExternalStore(
		subscribeLocalCli,
		getLocalCliSnapshot,
	);
	const [qrCode, setQrCode] = useState<string | null>(null);
	const [clientsOpen, setClientsOpen] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [logsOpen, setLogsOpen] = useState(false);
	useEffect(() => {
		let active = true;
		if (cli?.qrData)
			localCli.qrCode(cli.qrData).then((value) => {
				if (active) setQrCode(value);
			});
		else setQrCode(null);
		return () => {
			active = false;
		};
	}, [cli?.qrData]);
	const connectedClients =
		cli?.clients.filter((client) => client.connected).length ?? 0;
	const approvedClients =
		cli?.clients.filter((client) => client.approved).length ?? 0;
	return (
		<div className="flex h-full flex-col gap-4 overflow-auto p-4 text-primary-text">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="m-0 text-base font-bold">Remote Access</h2>
					<p className="m-0 mt-1 text-xs text-secondary-text opacity-70">
						Pair another device with this computer.
					</p>
				</div>
				<span className="icon-radio text-xl text-secondary-text opacity-70" />
			</div>
			{error && (
				<div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
					<div className="flex items-start gap-2">
						<div className="min-w-0 flex-1 break-words">{error}</div>
						<button
							type="button"
							className="flex size-6 shrink-0 items-center justify-center rounded-md border border-danger/30"
							aria-label="Copy error"
							title="Copy error"
							onClick={() =>
								void copyToClipboard({
									text: error,
									successMessage: "Error copied",
								})
							}
						>
							<span className="icon-copy" aria-hidden="true" />
						</button>
					</div>
					<button
						type="button"
						className="mt-2 rounded-md border border-danger/30 px-2 py-1 text-[11px] font-bold"
						onClick={() => void initializeLocalCli()}
					>
						Retry
					</button>
				</div>
			)}
			{cli ? (
				<>
					{cli.qrData && (
						<section>
							<h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-secondary-text">
								Remote pairing
							</h3>
							<div className="flex flex-col items-center gap-2 rounded-lg border border-card-border bg-popup-background p-3">
								{qrCode && (
									<img
										src={qrCode}
										alt="Remote pairing QR code"
										className="size-44 rounded-lg"
									/>
								)}
								<div className="max-w-full break-all font-mono text-[9px] text-secondary-text opacity-50">
									{cli.qrData}
								</div>
							</div>
						</section>
					)}
					<section>
						<DisclosureButton
							open={clientsOpen}
							onClick={() => setClientsOpen((value) => !value)}
							title="Clients"
							summary={`${connectedClients} connected · ${approvedClients} allowed`}
						/>
						{clientsOpen &&
							(cli.clients.length === 0 ? (
								<p className="text-xs text-secondary-text opacity-60">
									No clients yet.
								</p>
							) : (
								<div className="mt-2 flex flex-col gap-2">
									{cli.clients.map((client) => (
										<div
											key={client.clientId}
											className="flex items-center justify-between rounded-lg border border-card-border bg-popup-background p-3"
										>
											<div className="min-w-0">
												<div className="truncate text-xs font-bold">
													{client.deviceModel ?? client.platform}
												</div>
												<div className="truncate text-[10px] text-secondary-text opacity-60">
													{client.clientId}
													{client.connected ? " · connected" : ""}
												</div>
											</div>
											<button
												type="button"
												className="rounded-md border border-card-border px-2 py-1 text-[10px]"
												onClick={() =>
													void setLocalClientApproval(
														client.clientId,
														!client.approved,
													)
												}
											>
												{client.approved ? "Revoke" : "Allow"}
											</button>
										</div>
									))}
								</div>
							))}
					</section>
					<section>
						<DisclosureButton
							open={advancedOpen}
							onClick={() => setAdvancedOpen((value) => !value)}
							title="Advanced"
							summary={`CLI v${cli.cliVersion ?? "unknown"}`}
						/>
						{advancedOpen && (
							<div className="mt-2 flex flex-col gap-2">
								<div className="grid grid-cols-2 gap-2 text-xs">
									<Info
										label="Machine"
										value={cli.machineName ?? "This computer"}
									/>
									<Info label="CLI" value={`v${cli.cliVersion ?? "unknown"}`} />
									<Info label="Directory" value={cli.directory ?? "—"} />
									<Info label="Remote" value={cli.remoteState ?? "disabled"} />
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										className="rounded-lg border border-card-border bg-popup-background px-3 py-2 text-xs font-bold"
										onClick={() => setLogsOpen(true)}
									>
										View Logs…
									</button>
									<button
										type="button"
										className="rounded-lg border border-card-border bg-popup-background px-3 py-2 text-xs font-bold"
										onClick={() =>
											void copyToClipboard({
												text: JSON.stringify(cli, null, 2),
												successMessage: "Diagnostics copied",
											})
										}
									>
										Copy Diagnostics
									</button>
								</div>
							</div>
						)}
					</section>
					{logsOpen && (
						<LogsDialog logs={cli.logs} onClose={() => setLogsOpen(false)} />
					)}
				</>
			) : (
				!busy &&
				!error && (
					<button
						type="button"
						className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-text-invert"
						onClick={() => void initializeLocalCli()}
					>
						Retry
					</button>
				)
			)}
		</div>
	);
}

function DisclosureButton({
	open,
	onClick,
	title,
	summary,
}: {
	open: boolean;
	onClick: () => void;
	title: string;
	summary: string;
}) {
	return (
		<button
			type="button"
			className="flex w-full items-center justify-between gap-2 rounded-lg border border-card-border bg-popup-background px-3 py-2 text-left"
			onClick={onClick}
			aria-expanded={open}
		>
			<span>
				<span className="block text-xs font-bold">{title}</span>
				<span className="block text-[10px] text-secondary-text opacity-60">
					{summary}
				</span>
			</span>
			<span
				className={open ? "icon-chevron-down" : "icon-chevron-right"}
				aria-hidden="true"
			/>
		</button>
	);
}

function LogsDialog({
	logs,
	onClose,
}: {
	logs: Array<{ id: number; level: string; message: string }>;
	onClose: () => void;
}) {
	return (
		<div className="desktop-dialog-backdrop" role="presentation">
			<section
				className="desktop-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="local-cli-logs-title"
			>
				<header className="desktop-dialog-titlebar">
					<div className="desktop-dialog-title">
						<span className="icon-terminal" aria-hidden="true" />
						<span id="local-cli-logs-title">Remote Access Logs</span>
					</div>
					<button
						type="button"
						className="desktop-dialog-close"
						onClick={onClose}
						aria-label="Close logs"
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</header>
				<div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed">
					{logs.slice(-300).map((entry) => (
						<div
							key={entry.id}
							className={
								entry.level === "error" ? "text-danger" : "text-secondary-text"
							}
						>
							{entry.message}
						</div>
					))}
				</div>
			</section>
		</div>
	);
}

function Info({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-lg border border-card-border bg-popup-background p-3">
			<div className="text-[10px] font-bold uppercase text-secondary-text opacity-60">
				{label}
			</div>
			<div className="mt-1 truncate font-semibold">{value}</div>
		</div>
	);
}
