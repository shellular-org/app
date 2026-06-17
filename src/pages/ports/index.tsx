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

// Special filter value that matches only ports with a portless URL, rather
// than a process name.
const PORTLESS_FILTER = "portless";

interface PortGroup {
	process: string;
	entries: PortEntry[];
}

/**
 * Build the list of filter chips available for the current ports: one per
 * distinct (decoded, lowercased) process name, plus a special "portless" chip
 * when any port has a portless URL. Sorted alphabetically, portless last.
 */
function availableFilters(ports: PortEntry[]): string[] {
	const processes = new Set<string>();
	let hasPortless = false;
	for (const entry of ports) {
		processes.add(decodeProcessName(entry.process).toLowerCase());
		if (entry.portlessUrl) hasPortless = true;
	}
	const filters = Array.from(processes).sort((a, b) => a.localeCompare(b));
	if (hasPortless) filters.push(PORTLESS_FILTER);
	return filters;
}

function matchesFilter(entry: PortEntry, filter: string | null): boolean {
	if (filter === null) return true;
	if (filter === PORTLESS_FILTER) return !!entry.portlessUrl;
	return decodeProcessName(entry.process).toLowerCase() === filter;
}

/** Match a port against a free-text query: port number, process, or portless URL. */
function matchesQuery(entry: PortEntry, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return (
		String(entry.port).includes(q) ||
		decodeProcessName(entry.process).toLowerCase().includes(q) ||
		(entry.portlessUrl?.toLowerCase().includes(q) ?? false)
	);
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
	// null = "All". Otherwise a process name or the PORTLESS_FILTER sentinel.
	const [activeFilter, setActiveFilter] = useState<string | null>(null);
	const [query, setQuery] = useState("");

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
		// Prefer the portless `<name>.localhost` URL when the user has one mapped.
		const url = entry.portlessUrl ?? buildPortUrl(entry.port);
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

	const filters = availableFilters(ports);
	// If the active filter disappeared (e.g. that process closed), fall back to All.
	useEffect(() => {
		if (activeFilter !== null && !filters.includes(activeFilter)) {
			setActiveFilter(null);
		}
	}, [activeFilter, filters]);

	const visiblePorts = ports.filter(
		(p) => matchesFilter(p, activeFilter) && matchesQuery(p, query),
	);
	const groups = groupByProcess(visiblePorts);

	if (connectionStatus !== "connected") {
		return (
			<Page title="Ports">
				<EmptyState message="Not connected" mascot="sleep" />
			</Page>
		);
	}

	return (
		<Page title="Ports" rightSlot={rightSlot} className="ports-page">
			{!loading && !error && ports.length > 0 && (
				<div className="ports-search">
					<span className="icon-search ports-search-icon" aria-hidden="true" />
					<input
						type="text"
						className="ports-search-input"
						placeholder="Search port, process or portless…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Search ports"
					/>
					{/* Always rendered (hidden when empty) so it reserves its space
					    and the search bar height never shifts. */}
					<button
						type="button"
						className="ports-search-clear"
						onClick={() => setQuery("")}
						aria-label="Clear search"
						aria-hidden={!query}
						tabIndex={query ? 0 : -1}
						style={{ visibility: query ? "visible" : "hidden" }}
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</div>
			)}
			{!loading && !error && filters.length > 1 && (
				<div className="ports-filters" role="tablist" aria-label="Filter ports">
					<button
						type="button"
						role="tab"
						aria-selected={activeFilter === null}
						className={`ports-filter${
							activeFilter === null ? " ports-filter--active" : ""
						}`}
						onClick={() => setActiveFilter(null)}
					>
						All
					</button>
					{filters.map((filter) => {
						const isPortless = filter === PORTLESS_FILTER;
						return (
							<button
								key={filter}
								type="button"
								role="tab"
								aria-selected={activeFilter === filter}
								className={`ports-filter${
									activeFilter === filter ? " ports-filter--active" : ""
								}${isPortless ? " ports-filter--portless" : ""}`}
								onClick={() => setActiveFilter(filter)}
							>
								{isPortless && (
									<span className="icon-link" aria-hidden="true" />
								)}
								{filter}
							</button>
						);
					})}
				</div>
			)}
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
					<EmptyState
						message={
							query.trim() || activeFilter !== null
								? "No ports match"
								: "No open ports found"
						}
						mascot="rolling"
					/>
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
									// A portless mapping means this is definitely a web server.
									const canOpenBrowser =
										!!entry.portlessUrl || isWebPort(entry.port, group.process);
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
													{entry.portlessUrl ? (
														<span className="ports-portless">
															<span
																className="icon-link ports-portless-icon"
																aria-hidden="true"
															/>
															<span className="ports-portless-url">
																{entry.portlessUrl.replace(/^https?:\/\//, "")}
															</span>
														</span>
													) : (
														<span className="ports-address">
															{entry.address}
														</span>
													)}
													<span className="ports-meta">
														<span className="ports-pid">PID {entry.pid}</span>
														{entry.portlessUrl && (
															<span
																className="ports-portless-badge"
																title="Mapped by Vercel portless"
															>
																portless
															</span>
														)}
													</span>
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
