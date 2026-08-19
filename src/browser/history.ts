export const HISTORY_KEY = "shellular:browser-history:v1";
const MAX_HISTORY = 50;

export interface HistoryEntry {
	url: string;
	title: string;
	favicon: string;
	timestamp: number;
}

function getHistoryKey(hostId: string): string {
	return `${HISTORY_KEY}:${hostId}`;
}

export function getBrowserHistory(hostId: string): HistoryEntry[] {
	try {
		const raw = localStorage.getItem(getHistoryKey(hostId));
		if (!raw) return [];
		return JSON.parse(raw) as HistoryEntry[];
	} catch {
		return [];
	}
}

export function addBrowserHistory(
	hostId: string,
	entry: {
		url: string;
		title: string;
		favicon: string;
	},
): void {
	const list = getBrowserHistory(hostId);
	// Remove duplicate if same URL exists
	const filtered = list.filter((e) => e.url !== entry.url);
	filtered.unshift({
		url: entry.url,
		title: entry.title,
		favicon: entry.favicon,
		timestamp: Date.now(),
	});
	// Keep only the most recent entries
	const trimmed = filtered.slice(0, MAX_HISTORY);
	localStorage.setItem(getHistoryKey(hostId), JSON.stringify(trimmed));
}
