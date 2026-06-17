import themes from "themes";

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function decodeProcessName(name: string): string {
	return name.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
		String.fromCharCode(Number.parseInt(hex, 16)),
	);
}

export function themeStyles(): string {
	return themes.current?.css ?? "";
}

export const CSS = `
/* Icon font and classes are loaded via shellular://assets/style.css */

*{margin:0;padding:0;box-sizing:border-box}
html{background:var(--primary);color:var(--primary-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%}
body{padding:16px;padding-top:max(16px,env(safe-area-inset-top));display:flex;flex-direction:column;gap:24px;min-height:100vh}
a{color:inherit;text-decoration:none}
ul{list-style:none}

.section-title{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);opacity:.6;margin-bottom:10px}

/* ── Ports cards ── */
.ports-card{background:var(--surface-soft);border:1px solid var(--card-border);border-radius:14px;padding:14px 16px 0;display:flex;flex-direction:column;margin-bottom:12px}
.ports-card-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:12px}
.ports-process-name{font-size:13px;font-weight:700;color:var(--primary-text);font-family:'Courier New',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ports-card-count{font-size:11px;font-weight:600;color:var(--text-muted);opacity:.55;flex-shrink:0}
.ports-list{display:flex;flex-direction:column;list-style:none;margin:0;padding:0}
.ports-row{display:flex;flex-direction:column;border-top:1px solid var(--line-soft)}
.ports-row-main{display:flex;align-items:center;gap:12px;padding:10px 0;width:100%;background:none;border:none;color:inherit;cursor:pointer;text-align:left;-webkit-tap-highlight-color:transparent}
.ports-row-main:active{opacity:.75}
.ports-port-badge{font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:var(--accent);background:var(--surface-soft);border-radius:6px;padding:3px 7px;flex-shrink:0;min-width:60px;text-align:center}
.ports-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ports-address{font-size:13px;font-weight:500;color:var(--primary-text);font-family:'Courier New',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ports-pid{font-size:11px;color:var(--text-muted);opacity:.55}
.ports-expand-icon{font-size:16px;color:var(--text-muted);opacity:.5;flex-shrink:0;transition:transform .2s ease}
.ports-expand-icon.open{transform:rotate(180deg);opacity:.8}
.ports-actions{display:flex;flex-wrap:wrap;gap:8px;padding:0 0 12px}
.ports-action-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;border:1px solid var(--card-border);background:var(--surface-soft);color:var(--primary-text);font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;-webkit-tap-highlight-color:transparent}
.ports-action-btn:active{opacity:.65}

/* ── Ports header + refresh ── */
.ports-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.ports-header .section-title{margin-bottom:0}
.ports-refresh{background:none;border:none;color:var(--primary-text);cursor:pointer;padding:6px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;opacity:.7;-webkit-tap-highlight-color:transparent;text-decoration:none}
.ports-refresh:active{opacity:.4}

/* ── Portless URL + badge ── */
.ports-portless{display:flex;align-items:center;gap:5px;min-width:0;font-size:13px;font-weight:600;color:var(--accent);font-family:'Courier New',monospace}
.ports-portless-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ports-portless-icon{font-size:13px;flex-shrink:0;opacity:.8}
.ports-meta{display:flex;align-items:center;gap:7px}
.ports-portless-badge{flex-shrink:0;font-family:-apple-system,system-ui,sans-serif;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:5px;padding:1px 5px;line-height:1.4}

/* ── Search ── */
.ports-search{display:flex;align-items:center;gap:8px;padding:0 12px;height:38px;box-sizing:border-box;margin-bottom:12px;background:var(--surface-soft);border:1px solid var(--card-border);border-radius:10px}
.ports-search-icon{font-size:15px;color:var(--text-muted);opacity:.6;flex-shrink:0}
.ports-search-input{flex:1;min-width:0;padding:0;margin:0;background:none;border:none;outline:none;box-sizing:border-box;color:var(--primary-text);font-size:14px;line-height:1.2}
.ports-search-input::placeholder{color:var(--text-muted);opacity:.6}
.ports-search-clear{display:flex;align-items:center;justify-content:center;width:20px;height:20px;background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:15px;line-height:1;opacity:.6;flex-shrink:0;-webkit-tap-highlight-color:transparent}
.ports-search-clear:active{opacity:.3}

/* ── Filter chips ── */
.ports-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.ports-filter{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;border:1px solid var(--card-border);background:var(--surface-soft);color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ports-filter:active{opacity:.65}
.ports-filter--active{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent)}

/* ── History ── */
.history-list{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;border:1px solid var(--card-border);background:var(--surface-soft)}
.history-item{display:flex;align-items:center;gap:10px;padding:12px 14px;-webkit-tap-highlight-color:transparent}
.history-item:active{background:var(--line-soft)}
li+li .history-item{border-top:1px solid var(--line-soft)}
.history-favicon{width:20px;height:20px;border-radius:4px;flex-shrink:0;object-fit:contain}
.history-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center}
.history-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.history-title{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.history-url{font-size:11px;font-family:'Courier New',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-muted);opacity:.55}
.history-time{font-size:11px;color:var(--text-muted);opacity:.55}

/* ── Empty / error ── */
.empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:48px 0;color:var(--text-muted);opacity:.5}
.empty-icon{font-size:32px}
.empty p{font-size:13px}
.empty-text{font-size:13px;color:var(--text-muted);opacity:.4;padding:8px 0}
.error{display:flex;flex-direction:column;align-items:center;gap:8px;padding:48px 0;text-align:center;color:var(--danger)}
.error-icon{font-size:32px}
.error p{font-size:13px;opacity:.8}

/* ── Nav link ── */
.nav-link{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:10px;background:var(--surface-soft);border:1px solid var(--card-border);font-size:13px;font-weight:600;color:var(--accent);-webkit-tap-highlight-color:transparent;text-decoration:none}
.nav-link:active{opacity:.75}

/* ── Tips ── */
.tips-list{display:flex;flex-direction:column;gap:8px}
.tip{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--text-muted);line-height:1.4}
.tip-icon{flex-shrink:0;font-size:16px}
.tip b{color:var(--primary-text);font-weight:600}
`;
