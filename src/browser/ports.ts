import type { PortEntry } from "state/ports";
import { CSS, decodeProcessName, escapeHtml, themeStyles } from "./shared";

// Special filter value that matches only ports with a portless URL, rather
// than a process name. Mirrors the React Ports page.
const PORTLESS_FILTER = "portless";

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

/**
 * Build the filter chips for the current ports: one per distinct (decoded,
 * lowercased) process name, plus a special "portless" chip when any port has a
 * portless URL. Sorted alphabetically, portless last.
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

export function buildPortsPage(ports: PortEntry[]): string {
	const groups = groupByProcess(ports);
	const filters = availableFilters(ports);

	let portsHtml = "";
	if (groups.length === 0) {
		portsHtml =
			'<div class="empty"><span class="empty-icon icon-layers" aria-hidden="true"></span><p>No open ports found</p></div>';
	} else {
		for (const group of groups) {
			const count = group.entries.length;
			const processLower = group.process.toLowerCase();
			let rows = "";
			for (const entry of group.entries) {
				const scheme = entry.port === 443 ? "https" : "http";
				// Prefer the portless URL when the user has one mapped.
				const url = entry.portlessUrl ?? `${scheme}://localhost:${entry.port}`;
				const hasPortless = !!entry.portlessUrl;
				const portlessHost = hasPortless
					? // biome-ignore lint/style/noNonNullAssertion: guarded by hasPortless
						entry.portlessUrl!.replace(/^https?:\/\//, "")
					: "";

				// Display: portless host (with icon) replaces address when present.
				const infoMain = hasPortless
					? `<span class="ports-portless"><span class="icon-link ports-portless-icon" aria-hidden="true"></span><span class="ports-portless-url">${escapeHtml(
							portlessHost,
						)}</span></span>`
					: `<span class="ports-address">${escapeHtml(entry.address)}</span>`;

				const badge = hasPortless
					? `<span class="ports-portless-badge" title="Mapped by Vercel portless">portless</span>`
					: "";

				rows += `<li class="ports-row" data-port="${entry.port}" data-process="${escapeHtml(
					processLower,
				)}" data-portless="${hasPortless ? "1" : "0"}">
					<button type="button" class="ports-row-main" onclick="window.open('${escapeHtml(url)}')">
						<span class="ports-port-badge">:${entry.port}</span>
						<div class="ports-info">
							${infoMain}
							<span class="ports-meta"><span class="ports-pid">PID ${entry.pid}</span>${badge}</span>
						</div>
						<span class="icon-chevron-right ports-expand-icon" aria-hidden="true"></span>
					</button>
				</li>`;
			}
			portsHtml += `<div class="ports-card">
				<div class="ports-card-header">
					<span class="ports-process-name">${escapeHtml(group.process)}</span>
					<span class="ports-card-count">${count} port${count !== 1 ? "s" : ""}</span>
				</div>
				<ul class="ports-list">${rows}</ul>
			</div>`;
		}
	}

	// Search bar + filter chips (only when there are ports to act on).
	const hasPorts = ports.length > 0;
	const searchHtml = hasPorts
		? `<div class="ports-search">
			<span class="icon-search ports-search-icon" aria-hidden="true"></span>
			<input type="text" id="ports-search-input" class="ports-search-input" placeholder="Search port, process or portless…" oninput="applyPortFilters()" aria-label="Search ports">
			<button type="button" id="ports-search-clear" class="ports-search-clear" style="visibility:hidden" onclick="clearPortSearch()" aria-label="Clear search"><span class="icon-x" aria-hidden="true"></span></button>
		</div>`
		: "";

	let filterChips = "";
	if (filters.length > 1) {
		const chip = (value: string | null, label: string, extra = "") =>
			`<button type="button" class="ports-filter${extra}" data-filter="${
				value === null ? "" : escapeHtml(value)
			}" onclick="setPortFilter(this)">${label}</button>`;
		const chips = [chip(null, "All", " ports-filter--active")];
		for (const filter of filters) {
			const isPortless = filter === PORTLESS_FILTER;
			const icon = isPortless
				? '<span class="icon-link" aria-hidden="true"></span>'
				: "";
			chips.push(
				chip(
					filter,
					`${icon}${escapeHtml(filter)}`,
					isPortless ? " ports-filter--portless" : "",
				),
			);
		}
		filterChips = `<div class="ports-filters" role="tablist" aria-label="Filter ports">${chips.join(
			"",
		)}</div>`;
	}

	const refreshBtn = `<button type="button" class="ports-refresh" onclick="window.location.href='shellular://ports'" aria-label="Refresh"><span class="icon-refresh-cw" aria-hidden="true"></span></button>`;

	return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ports</title>
<link rel="stylesheet" href="shellular://assets/style.css">
<style>${themeStyles()}${CSS}</style>
</head><body>
<div class="section">
	<div class="ports-header">
		<h2 class="section-title">Open Ports</h2>
		${refreshBtn}
	</div>
	${searchHtml}
	${filterChips}
	<div id="ports-empty-match" class="empty" style="display:none"><span class="empty-icon icon-search" aria-hidden="true"></span><p>No ports match</p></div>
	<div id="ports-results">${portsHtml}</div>
</div>
<script>
var activeFilter = "";

function setPortFilter(btn) {
	activeFilter = btn.getAttribute("data-filter") || "";
	var chips = document.querySelectorAll(".ports-filter");
	for (var i = 0; i < chips.length; i++) {
		chips[i].classList.toggle("ports-filter--active", chips[i] === btn);
	}
	applyPortFilters();
}

function clearPortSearch() {
	var input = document.getElementById("ports-search-input");
	if (input) { input.value = ""; }
	applyPortFilters();
}

function applyPortFilters() {
	var input = document.getElementById("ports-search-input");
	var q = (input ? input.value : "").trim().toLowerCase();

	var clearBtn = document.getElementById("ports-search-clear");
	if (clearBtn) { clearBtn.style.visibility = q ? "visible" : "hidden"; }

	var rows = document.querySelectorAll(".ports-row");
	var anyVisible = false;

	for (var i = 0; i < rows.length; i++) {
		var row = rows[i];
		var port = row.getAttribute("data-port") || "";
		var proc = row.getAttribute("data-process") || "";
		var isPortless = row.getAttribute("data-portless") === "1";

		var matchFilter = true;
		if (activeFilter === "portless") { matchFilter = isPortless; }
		else if (activeFilter) { matchFilter = proc === activeFilter; }

		var matchQuery = !q || port.indexOf(q) !== -1 || proc.indexOf(q) !== -1 ||
			(isPortless && row.textContent.toLowerCase().indexOf(q) !== -1);

		var visible = matchFilter && matchQuery;
		row.style.display = visible ? "flex" : "none";
		if (visible) { anyVisible = true; }
	}

	// Hide cards whose rows are all filtered out.
	var cards = document.querySelectorAll(".ports-card");
	for (var c = 0; c < cards.length; c++) {
		var card = cards[c];
		var cardRows = card.querySelectorAll(".ports-row");
		var shown = false;
		for (var r = 0; r < cardRows.length; r++) {
			if (cardRows[r].style.display !== "none") { shown = true; break; }
		}
		card.style.display = shown ? "flex" : "none";
	}

	var emptyMatch = document.getElementById("ports-empty-match");
	var results = document.getElementById("ports-results");
	var hasRows = rows.length > 0;
	if (emptyMatch && hasRows) {
		emptyMatch.style.display = anyVisible ? "none" : "flex";
		if (results) { results.style.display = anyVisible ? "block" : "none"; }
	}
}
</script>
</body></html>`;
}
