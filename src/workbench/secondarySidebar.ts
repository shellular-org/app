import type { AiBackend, GitCommit } from "@shellular/protocol";

export const DESKTOP_SECONDARY_SIDEBAR_ID = "desktop-secondary-sidebar";

export type DesktopSecondarySidebarRoute =
	| { view: "agents" }
	| { view: "bookmarked-chats" }
	| {
			view: "sessions";
			agentId: AiBackend;
			workspacePath?: string;
			activeChatId?: string;
	  }
	| {
			view: "git-history";
			projectPath: string;
			projectName: string;
	  }
	| {
			view: "git-commit";
			projectPath: string;
			projectName: string;
			commit: GitCommit;
	  };

export interface DesktopSecondarySidebarSnapshot {
	open: boolean;
	stack: readonly DesktopSecondarySidebarRoute[];
}

const listeners = new Set<() => void>();
let snapshot: DesktopSecondarySidebarSnapshot = {
	open: false,
	stack: [],
};

function emit(next: DesktopSecondarySidebarSnapshot) {
	if (next.open === snapshot.open && next.stack === snapshot.stack) return;
	snapshot = next;
	for (const listener of listeners) listener();
}

export function subscribeDesktopSecondarySidebar(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getDesktopSecondarySidebarSnapshot() {
	return snapshot;
}

export function openDesktopSecondarySidebar(
	path: readonly DesktopSecondarySidebarRoute[],
) {
	if (path.length === 0) return;
	const samePath =
		path.length === snapshot.stack.length &&
		path.every(
			(route, index) =>
				secondarySidebarRouteKey(route) ===
				secondarySidebarRouteKey(snapshot.stack[index]),
		);
	emit({
		open: true,
		stack: samePath ? replaceRoutes(snapshot.stack, path) : [...path],
	});
}

export function pushDesktopSecondarySidebar(
	route: DesktopSecondarySidebarRoute,
) {
	const key = secondarySidebarRouteKey(route);
	const existing = snapshot.stack.findIndex(
		(candidate) => secondarySidebarRouteKey(candidate) === key,
	);
	const stack =
		existing >= 0
			? [...snapshot.stack.slice(0, existing), route]
			: [...snapshot.stack, route];
	emit({ open: true, stack });
}

export function backDesktopSecondarySidebar() {
	if (snapshot.stack.length <= 1) return;
	emit({ open: true, stack: snapshot.stack.slice(0, -1) });
}

export function closeDesktopSecondarySidebar() {
	if (!snapshot.open) return;
	emit({ ...snapshot, open: false });
}

export function resetDesktopSecondarySidebar() {
	emit({ open: false, stack: [] });
}

export function showAgentsSidebar() {
	openDesktopSecondarySidebar([{ view: "agents" }]);
}

export function showBookmarkedChatsSidebar() {
	openDesktopSecondarySidebar([
		{ view: "agents" },
		{ view: "bookmarked-chats" },
	]);
}

export function showSessionsSidebar(options: {
	agentId: AiBackend;
	workspacePath?: string;
	activeChatId?: string;
}) {
	openDesktopSecondarySidebar([
		{ view: "agents" },
		{ view: "sessions", ...options },
	]);
}

export function showGitHistorySidebar(
	projectPath: string,
	projectName: string,
) {
	openDesktopSecondarySidebar([
		{ view: "git-history", projectPath, projectName },
	]);
}

export function secondarySidebarRouteKey(
	route: DesktopSecondarySidebarRoute,
) {
	switch (route.view) {
		case "agents":
		case "bookmarked-chats":
			return route.view;
		case "sessions":
			return `sessions:${route.agentId}:${route.workspacePath ?? "*"}`;
		case "git-history":
			return `git-history:${route.projectPath}`;
		case "git-commit":
			return `git-commit:${route.projectPath}:${route.commit.hash}`;
	}
}

function replaceRoutes(
	current: readonly DesktopSecondarySidebarRoute[],
	next: readonly DesktopSecondarySidebarRoute[],
) {
	let changed = false;
	const routes = next.map((route, index) => {
		if (current[index] === route) return route;
		changed = true;
		return route;
	});
	return changed ? routes : current;
}
