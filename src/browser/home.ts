import { formatRelativeTime } from "lib/utils";
import type { HistoryEntry } from "./history";
import { CSS, escapeHtml, themeStyles } from "./shared";

export function buildHomePage(history: HistoryEntry[]): string {
	let historyHtml = "";
	if (history.length === 0) {
		historyHtml = '<p class="empty-text">No browsing history yet</p>';
	} else {
		let items = "";
		for (const entry of history) {
			const timeStr = formatRelativeTime(entry.timestamp);
			const titleText = entry.title || entry.url;
			const faviconHtml = entry.favicon
				? `<img class="history-favicon" src="${escapeHtml(entry.favicon)}" onerror="this.outerHTML='<span class=\\'history-icon icon-globe\\'></span>'">`
				: '<span class="history-icon icon-globe" aria-hidden="true"></span>';
			items += `<li>
				<a href="${escapeHtml(entry.url)}" class="history-item">
					${faviconHtml}
					<div class="history-info">
						<span class="history-title">${escapeHtml(titleText)}</span>
						<span class="history-url">${escapeHtml(entry.url)}</span>
						<span class="history-time">${timeStr}</span>
					</div>
					<span class="icon-chevron-right" style="font-size:18px;color:var(--text-muted);flex-shrink:0" aria-hidden="true"></span>
				</a>
			</li>`;
		}
		historyHtml = `<ul class="history-list">${items}</ul>`;
	}

	return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Home</title>
<link rel="stylesheet" href="shellular://assets/style.css">
<style>${themeStyles()}${CSS}</style>
</head><body>
<div class="section" style="display:flex;flex-direction:column;gap:12px">
	<a href="shellular://ports" class="nav-link"><span class="icon-power-cord" aria-hidden="true"></span> Ports</a>
</div>
<div class="section">
	<h2 class="section-title">Recent</h2>
	${historyHtml}
</div>
<div class="section">
	<h2 class="section-title">Tips</h2>
	<div class="tips-list">
		<div class="tip"><span class="tip-icon icon-terminal" aria-hidden="true"></span><span>Tap the <b>Console</b> button in the bottom toolbar to inspect pages with devtools</span></div>
		<div class="tip"><span class="tip-icon icon-smartphone" aria-hidden="true"></span><span>Use <b>menu → Devices</b> to emulate different screen sizes</span></div>
		<div class="tip"><span class="tip-icon icon-monitor" aria-hidden="true"></span><span>Enable <b>Desktop mode</b> via Devices to see full desktop layouts</span></div>
		<div class="tip"><span class="tip-icon icon-refresh-cw" aria-hidden="true"></span><span>Use <b>menu → Disable Cache</b> to force reload without cache</span></div>
	</div>
</div>
</body></html>`;
}
