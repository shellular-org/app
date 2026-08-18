import { fetchPorts, type PortEntry } from "state/ports";
import { addBrowserHistory, getBrowserHistory } from "./history";
import { buildHomePage } from "./home";
import { buildPortsPage } from "./ports";
import { themeStyles } from "./shared";

const PORTS_CACHE_KEY = "shellular:ports-cache:v1";

function getCachedPorts(): PortEntry[] {
	try {
		const raw = localStorage.getItem(PORTS_CACHE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as PortEntry[];
	} catch {
		return [];
	}
}

export function cachePorts(ports: PortEntry[]): void {
	try {
		localStorage.setItem(PORTS_CACHE_KEY, JSON.stringify(ports));
	} catch {}
}

declare global {
	interface Window {
		__shellularPage?: (name: string) => Promise<string>;
		__shellularHistory?: (entry: {
			url: string;
			title: string;
			favicon: string;
		}) => void;
	}
}

export function initBrowserBridge(): void {
	window.__shellularPage = async (name: string): Promise<string> => {
		switch (name) {
			case "home":
				return buildHomePage(getBrowserHistory());
			case "ports": {
				try {
					const ports = await fetchPorts();
					cachePorts(ports);
					return buildPortsPage(ports);
				} catch {
					return buildPortsPage(getCachedPorts());
				}
			}
			default:
				return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not Found</title><style>${themeStyles()}html{background:var(--primary);color:var(--primary-text);font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}</style></head><body><p>Page not found: ${name}</p></body></html>`;
		}
	};

	window.__shellularHistory = (entry: {
		url: string;
		title: string;
		favicon: string;
	}): void => {
		if (!entry.url) return;
		addBrowserHistory(entry);
	};
}
