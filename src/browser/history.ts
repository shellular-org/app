export const HISTORY_KEY = "shellular:browser-history";
const MAX_HISTORY = 50;

export interface HistoryEntry {
	url: string;
	title: string;
	favicon: string;
	timestamp: number;
}

export function getBrowserHistory(): HistoryEntry[] {
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as HistoryEntry[];
	} catch {
		return [];
	}
}

export function addBrowserHistory(entry: {
	url: string;
	title: string;
	favicon: string;
}): void {
	const list = getBrowserHistory();
	// Remove duplicate if same URL exists
	const filtered = list.slice(0, 3).filter((e) => e.url !== entry.url);
	filtered.unshift({
		url: entry.url,
		title: entry.title,
		favicon: entry.favicon,
		timestamp: Date.now(),
	});
	// Keep only the most recent entries
	const trimmed = filtered.slice(0, MAX_HISTORY);
	localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}
