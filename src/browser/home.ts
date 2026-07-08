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
<title>New Tab</title>
<link rel="stylesheet" href="shellular://assets/style.css">
<style>${themeStyles()}${CSS}</style>
</head><body>
<div class="newtab-hero">
	<span class="icon-shellular newtab-logo" aria-hidden="true"></span>
	<h1 class="newtab-title">New Tab</h1>
	<form class="newtab-search" onsubmit="return __go(this)">
		<span class="icon-search newtab-search-icon" aria-hidden="true"></span>
		<input type="text" name="q" class="newtab-search-input" placeholder="e.g. localhost:3000"
			autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"
			enterkeyhint="go" inputmode="url" aria-label="Search or enter address">
	</form>
</div>
<div class="section" style="display:flex;flex-direction:column;gap:12px">
	<a href="shellular://ports" class="nav-link"><span class="icon-power-cord" aria-hidden="true"></span> Browse open ports</a>
</div>
<div class="section">
	<h2 class="section-title">Recent</h2>
	${historyHtml}
</div>
<div class="section">
	<h2 class="section-title">Tips</h2>
	<div class="tips-list">
		<div class="tip"><span class="tip-icon icon-terminal" aria-hidden="true"></span><span>Tap the <b>Console</b> button in the bottom toolbar to inspect pages with devtools</span></div>
		<div class="tip"><span class="tip-icon icon-monitor" aria-hidden="true"></span><span>Use <b>menu → Devices</b> to emulate different screen sizes, including Desktop screen</span></div>
		<div class="tip"><span class="tip-icon icon-refresh-cw" aria-hidden="true"></span><span>Use <b>menu → Disable Cache</b> to force reload without cache</span></div>
	</div>
</div>
<script>
function __go(form){
	var q=(form.q.value||"").trim();
	if(!q)return false;
	var url;
	if(/^[a-z][a-z0-9+.-]*:\\/\\//i.test(q)){
		// already has a scheme (http://, https://, etc.)
		url=q;
	}else if(/\\s/.test(q)){
		// contains whitespace -> definitely a search query
		url="https://www.google.com/search?q="+encodeURIComponent(q);
	}else if(/^localhost(:\\d+)?(\\/|$)/i.test(q)||/^127\\.0\\.0\\.1(:\\d+)?(\\/|$)/.test(q)||/^[^/\\s]+:\\d+(\\/|$)/.test(q)){
		// localhost / 127.0.0.1 / host:port (e.g. localhost:3000) -> local dev, use http
		url="http://"+q;
	}else if(/^\\S+\\.\\S+$/.test(q)){
		// looks like a domain (e.g. github.com) -> default to https
		url="https://"+q;
	}else{
		url="https://www.google.com/search?q="+encodeURIComponent(q);
	}
	window.location.href=url;
	return false;
}
</script>
</body></html>`;
}
