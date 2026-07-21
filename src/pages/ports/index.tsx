import "./style.scss";
import dialog from "bridge/dialog";
import { cachePorts } from "browser";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import Page from "components/Page";
import { useCallback, useEffect, useState } from "react";
import { useShellular } from "state";
import { fetchPorts, killPort, type PortEntry } from "state/ports";
import { openBrowserSurface } from "workbench/browserSurface";

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

// Shared class strings for repeated elements (avoid duplicating long utility
// lists across the All chip and the per-process chips).
const PORTS_FILTER_BASE =
	"inline-flex items-center gap-[5px] px-3 py-[5px] rounded-[20px] border text-xs font-semibold cursor-pointer [-webkit-tap-highlight-color:transparent] transition-[opacity,color,background-color,border-color] duration-150 active:opacity-65";
const PORTS_FILTER_ACTIVE =
	"text-info border-[color-mix(in_srgb,var(--info)_40%,transparent)] bg-[color-mix(in_srgb,var(--info)_12%,transparent)]";
// Note: no color/background/border-color here — callers set those. Baking in
// `text-primary-text` would win over a caller's `text-danger` (equal-specificity
// utilities resolve by stylesheet order, not class-string order).
const PORTS_ACTION_BTN =
	"inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[20px] border text-[13px] font-medium cursor-pointer [-webkit-tap-highlight-color:transparent] transition-opacity active:opacity-65 disabled:opacity-40 disabled:cursor-not-allowed";

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
		await openBrowserSurface(
			url,
			entry.portlessUrl?.replace(/^https?:\/\//, "") ?? `:${entry.port}`,
		);
	}

	const rightSlot = (
		<button
			type="button"
			className="flex items-center justify-center p-1.5 rounded-lg border-none bg-none text-primary-text text-[18px] opacity-70 cursor-pointer [-webkit-tap-highlight-color:transparent] transition-opacity active:opacity-40 disabled:opacity-30 disabled:cursor-not-allowed"
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
				<div className="shrink-0 flex items-center gap-2 px-3 h-[38px] box-border mb-3 bg-surface-soft border border-card-border rounded-[10px]">
					<span
						className="icon-search text-[15px] text-secondary-text opacity-60 shrink-0"
						aria-hidden="true"
					/>
					<input
						type="text"
						className="flex-1 min-w-0 p-0 m-0 bg-none border-none outline-none box-border text-primary-text text-sm leading-tight placeholder:text-secondary-text placeholder:opacity-60"
						placeholder="Search port, process or portless…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Search ports"
					/>
					{/* Always rendered (hidden when empty) so it reserves its space
					    and the search bar height never shifts. */}
					<button
						type="button"
						className="flex items-center justify-center w-5 h-5 bg-none border-none text-secondary-text cursor-pointer p-0 text-[15px] leading-none opacity-60 shrink-0 [-webkit-tap-highlight-color:transparent] active:opacity-30"
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
				<div
					className="flex flex-wrap gap-2 mb-4"
					role="tablist"
					aria-label="Filter ports"
				>
					<button
						type="button"
						role="tab"
						aria-selected={activeFilter === null}
						className={`${PORTS_FILTER_BASE} ${
							activeFilter === null
								? PORTS_FILTER_ACTIVE
								: "text-secondary-text border-card-border bg-surface-soft"
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
								className={`${PORTS_FILTER_BASE} ${
									activeFilter === filter
										? PORTS_FILTER_ACTIVE
										: "text-secondary-text border-card-border bg-surface-soft"
								}`}
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
				<div className="flex items-center justify-center gap-2.5 py-[60px] text-secondary-text text-sm opacity-70">
					<Loader />
					<span>Loading…</span>
				</div>
			)}
			{!loading && error && (
				<div className="flex flex-col items-center gap-2 px-6 py-[60px] text-center text-danger">
					<span className="icon-alert-circle text-[32px]" />
					<p className="m-0 text-sm opacity-80">{error}</p>
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
						<div
							key={group.process}
							className="flex flex-col mb-4 px-4 pt-3.5 bg-surface-soft border border-card-border rounded-[14px]"
						>
							<div className="flex items-center justify-between gap-2 pb-3">
								<span className="text-[13px] font-bold text-primary-text font-['Courier_New',monospace] overflow-hidden text-ellipsis whitespace-nowrap">
									{group.process}
								</span>
								<span className="text-[11px] font-semibold text-secondary-text opacity-55 shrink-0">
									{group.entries.length} port
									{group.entries.length !== 1 ? "s" : ""}
								</span>
							</div>
							<ul className="list-none m-0 p-0 flex flex-col">
								{group.entries.map((entry) => {
									const isExpanded = expandedPort === entry.port;
									// A portless mapping means this is definitely a web server.
									const canOpenBrowser =
										!!entry.portlessUrl || isWebPort(entry.port, group.process);
									return (
										<li
											key={entry.port}
											className="flex flex-col border-t border-line-soft"
										>
											<button
												type="button"
												className="flex items-center gap-3 py-2.5 min-w-0 w-full bg-none border-none text-inherit cursor-pointer text-left [-webkit-tap-highlight-color:transparent] active:opacity-75"
												onClick={() =>
													setExpandedPort(isExpanded ? null : entry.port)
												}
											>
												{killing.has(entry.port) ? (
													<span className="font-['Courier_New',monospace] text-[13px] font-bold rounded-md px-[7px] py-[3px] shrink-0 min-w-[60px] flex items-center justify-center bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)]">
														<Loader size={12} />
													</span>
												) : (
													<span className="font-['Courier_New',monospace] text-[13px] font-bold text-info bg-surface-soft rounded-md px-[7px] py-[3px] shrink-0 min-w-[60px] text-center">
														:{entry.port}
													</span>
												)}
												<div className="flex-1 min-w-0 flex flex-col gap-0.5">
													{entry.portlessUrl ? (
														<span className="flex items-center gap-[5px] min-w-0 text-[13px] font-semibold text-info font-['Courier_New',monospace]">
															<span
																className="icon-link text-[13px] shrink-0 opacity-80"
																aria-hidden="true"
															/>
															<span className="overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
																{entry.portlessUrl.replace(/^https?:\/\//, "")}
															</span>
														</span>
													) : (
														<span className="text-[13px] font-medium text-primary-text font-['Courier_New',monospace] overflow-hidden text-ellipsis whitespace-nowrap">
															{entry.address}
														</span>
													)}
													<span className="flex items-center gap-[7px]">
														<span className="text-[11px] text-secondary-text opacity-55">
															PID {entry.pid}
														</span>
														{entry.portlessUrl && (
															<span
																className="shrink-0 font-sans text-[9px] font-bold tracking-[0.04em] uppercase text-info bg-[color-mix(in_srgb,var(--info)_14%,transparent)] border border-[color-mix(in_srgb,var(--info)_30%,transparent)] rounded-[5px] px-[5px] py-px leading-[1.4]"
																title="Mapped by Vercel portless"
															>
																portless
															</span>
														)}
													</span>
												</div>
												<span
													className={`icon-chevron-down text-base text-secondary-text shrink-0 transition-transform duration-200 ${
														isExpanded ? "rotate-180 opacity-80" : "opacity-50"
													}`}
													aria-hidden="true"
												/>
											</button>
											{isExpanded && (
												<div className="flex flex-wrap gap-2 pb-3">
													{canOpenBrowser && (
														<button
															type="button"
															className={`${PORTS_ACTION_BTN} border-card-border bg-surface-soft text-primary-text`}
															onClick={() => handleOpenInBrowser(entry)}
														>
															<span className="icon-globe" aria-hidden="true" />
															Open in Browser
														</button>
													)}
													<button
														type="button"
														className={`${PORTS_ACTION_BTN} text-danger border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]`}
														disabled={killing.has(entry.port)}
														onClick={() => handleKill(entry.port)}
													>
														<span
															className="icon-stop-circle"
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
