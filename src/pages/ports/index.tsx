import browser from "bridge/browser";
import dialog from "bridge/dialog";
import { cachePorts } from "browser";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { useCallback, useEffect, useState } from "react";
import { useShellular } from "state";
import { fetchPorts, killPort, type PortEntry } from "state/ports";
import "./style.scss";
import Loader from "components/Loader";

// Ports that are almost certainly running an HTTP server
const WEB_PORTS = new Set([
	80, 443, 1234, 2000, 2020, 3000, 3001, 3030, 4000, 4200, 4321, 4400, 5000,
	5173, 5174, 5500, 7000, 7070, 8000, 8008, 8080, 8081, 8082, 8088, 8443, 8888,
	9000, 9001, 9090,
]);

// Processes that commonly run web servers
const WEB_PROCESSES = [
	"node",
	"python",
	"python3",
	"ruby",
	"deno",
	"bun",
	"nginx",
	"apache",
	"apache2",
	"httpd",
	"caddy",
	"traefik",
];

function isWebPort(port: number, process: string): boolean {
	if (WEB_PORTS.has(port)) return true;
	const proc = process.toLowerCase();
	return WEB_PROCESSES.some((p) => proc.includes(p));
}

function buildPortUrl(port: number): string {
	const scheme = port === 443 ? "https" : "http";
	return `${scheme}://localhost:${port}`;
}

/** Decode hex escape sequences in process names, e.g. "Code\x20Helper" → "Code Helper" */
function decodeProcessName(name: string): string {
	return name.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
		String.fromCharCode(parseInt(hex, 16)),
	);
}

interface PortGroup {
	process: string;
	entries: PortEntry[];
}

function groupByProcess(ports: PortEntry[]): PortGroup[] {
	const map = new Map<string, PortEntry[]>();
	for (const entry of ports) {
		const name = decodeProcessName(entry.process);
		const list = map.get(name) ?? [];
		list.push(entry);
		map.set(name, list);
	}
	return Array.from(map.entries())
		.map(([process, entries]) => ({ process, entries }))
		.sort((a, b) => a.process.localeCompare(b.process));
}

export default function PortsPage() {
	const { connectionStatus } = useShellular();
	const [ports, setPorts] = useState<PortEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [killing, setKilling] = useState<Set<number>>(new Set());
	const [expandedPort, setExpandedPort] = useState<number | null>(null);

	const load = useCallback(async (initial?: boolean) => {
		if (initial) setLoading(true);
		setError("");
		try {
			const result = await fetchPorts();
			setPorts(result);
			cachePorts(result);
		} catch (err) {
			setError((err as Error).message ?? "Failed to fetch ports");
		} finally {
			if (initial) setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (connectionStatus === "connected") {
			load(true);
		}
	}, [connectionStatus, load]);

	async function handleKill(port: number) {
		const input = await dialog.textInput(
			`Type ${port} to confirm killing the process on this port.`,
			"",
			"Kill Port",
		);
		if (input === null) return;
		if (input.trim() !== String(port)) {
			await dialog.message("Port number did not match. Kill cancelled.");
			return;
		}
		setExpandedPort(null);
		setKilling((prev) => new Set(prev).add(port));
		try {
			await killPort(port);
			await load();
		} catch (err) {
			setError((err as Error).message ?? "Failed to kill port");
		} finally {
			setKilling((prev) => {
				const next = new Set(prev);
				next.delete(port);
				return next;
			});
		}
	}

	async function handleOpenInBrowser(entry: PortEntry) {
		const url = buildPortUrl(entry.port);
		setExpandedPort(null);
		await browser.open(url);
	}

	const rightSlot = (
		<button
			type="button"
			className="ports-refresh-btn"
			disabled={loading}
			onClick={() => load(true)}
			aria-label="Refresh"
		>
			<span className="icon-refresh-cw" />
		</button>
	);

	const groups = groupByProcess(ports);

	if (connectionStatus !== "connected") {
		return (
			<Page title="Ports">
				<EmptyState message="Not connected" mascot="sleep" />
			</Page>
		);
	}

	return (
		<Page title="Ports" rightSlot={rightSlot} className="ports-page">
			{loading && (
				<div className="ports-loading">
					<Loader />
					<span>Loading…</span>
				</div>
			)}
			{!loading && error && (
				<div className="ports-error">
					<span className="icon-alert-circle ports-error-icon" />
					<p>{error}</p>
				</div>
			)}
			{!loading &&
				!error &&
				(groups.length === 0 ? (
					<EmptyState message="No open ports found" mascot="rolling" />
				) : (
					groups.map((group) => (
						<div key={group.process} className="ports-card">
							<div className="ports-card-header">
								<span className="ports-process-name">{group.process}</span>
								<span className="ports-card-count">
									{group.entries.length} port
									{group.entries.length !== 1 ? "s" : ""}
								</span>
							</div>
							<ul className="ports-list">
								{group.entries.map((entry) => {
									const isExpanded = expandedPort === entry.port;
									const canOpenBrowser = isWebPort(entry.port, group.process);
									return (
										<li key={entry.port} className="ports-row">
											<button
												type="button"
												className="ports-row-main"
												onClick={() =>
													setExpandedPort(isExpanded ? null : entry.port)
												}
											>
												{killing.has(entry.port) ? (
													<span className="ports-port-badge ports-port-badge--killing">
														<Loader size={12} />
													</span>
												) : (
													<span className="ports-port-badge">
														:{entry.port}
													</span>
												)}
												<div className="ports-info">
													<span className="ports-address">{entry.address}</span>
													<span className="ports-pid">PID {entry.pid}</span>
												</div>
												<span
													className={`icon-chevron-down ports-expand-icon${
														isExpanded ? " ports-expand-icon--open" : ""
													}`}
													aria-hidden="true"
												/>
											</button>
											{isExpanded && (
												<div className="ports-actions">
													{canOpenBrowser && (
														<button
															type="button"
															className="ports-action-btn"
															onClick={() => handleOpenInBrowser(entry)}
														>
															<span className="icon-globe" aria-hidden="true" />
															Open in Browser
														</button>
													)}
													<button
														type="button"
														className="ports-action-btn ports-action-btn--danger"
														disabled={killing.has(entry.port)}
														onClick={() => handleKill(entry.port)}
													>
														<span
															className="icon-x-circle"
															aria-hidden="true"
														/>
														Kill Process
													</button>
												</div>
											)}
										</li>
									);
								})}
							</ul>
						</div>
					))
				))}
		</Page>
	);
}
