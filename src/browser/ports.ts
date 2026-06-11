import type { PortEntry } from "state/ports";
import { CSS, decodeProcessName, escapeHtml, themeStyles } from "./shared";

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

export function buildPortsPage(ports: PortEntry[]): string {
	const groups = groupByProcess(ports);

	let portsHtml = "";
	if (groups.length === 0) {
		portsHtml =
			'<div class="empty"><span class="empty-icon icon-layers" aria-hidden="true"></span><p>No open ports found</p></div>';
	} else {
		for (const group of groups) {
			const count = group.entries.length;
			let rows = "";
			for (const entry of group.entries) {
				const scheme = entry.port === 443 ? "https" : "http";
				const url = `${scheme}://localhost:${entry.port}`;
				rows += `<li class="ports-row" id="row-${entry.port}">
					<button type="button" class="ports-row-main" onclick="window.open('${url}')">
						<span class="ports-port-badge">:${entry.port}</span>
						<div class="ports-info">
							<span class="ports-address">${escapeHtml(entry.address)}</span>
							<span class="ports-pid">PID ${entry.pid}</span>
						</div>
						<span class="icon-chevron-right ports-expand-icon" id="chev-${entry.port}" aria-hidden="true"></span>
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

	return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ports</title>
<link rel="stylesheet" href="shellular://assets/style.css">
<style>${themeStyles()}${CSS}</style>
</head><body>
<div class="section">
	<h2 class="section-title">Open Ports</h2>
	${portsHtml}
</div>
<script>
function toggle(port) {
	var act = document.getElementById('act-' + port);
	var chev = document.getElementById('chev-' + port);
	var open = act.style.display === 'none';
	act.style.display = open ? 'flex' : 'none';
	if (open) { chev.classList.add('open'); } else { chev.classList.remove('open'); }
}
</script>
</body></html>`;
}
