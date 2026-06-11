import "./App.scss";
import browser from "bridge/browser";
import AppDialogHost from "components/AppDialog";
import ConnectionStatus from "components/ConnectionStatus";
import EmptyState from "components/EmptyState";
import actionStack from "lib/actionStack";
import * as store from "lib/store";
import OnboardingPage from "pages/onboarding";
import {
	type ComponentType,
	type LazyExoticComponent,
	lazy,
	type ReactElement,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { ShellularProvider, useShellular } from "state";
import {
	getHasAnyStreaming,
	listenToSessionStreamingEvent,
} from "state/sessions";

type TabId = "home" | "terminals" | "projects" | "agents" | "more" | "browser";

interface Tab {
	id: TabId;
	label: string;
	icon: string;
	disabled?: boolean;
}

interface PageStackEntry {
	id: string;
	element: ReactElement;
	showConnectionBanner: boolean;
}

const ONBOARDING_KEY = "shellular:onboarding-complete";
const PAGE_HIDE_DURATION = 240;
const TABS: Tab[] = [
	{ id: "home", label: "Home", icon: "home" },
	{
		id: "agents",
		label: "Agents",
		icon: "ai-chat",
	},
	{
		id: "projects",
		label: "Projects",
		icon: "code",
	},
	{
		id: "terminals",
		label: "Terminal",
		icon: "terminal",
	},
	{
		id: "browser",
		label: "Browser",
		icon: "globe",
		disabled: process.env.IS_BROWSER,
	},
	{
		id: "more",
		label: "More",
		icon: "grid",
	},
].filter((tab) => !tab.disabled) as Tab[];

const TABS_MAP: Record<TabId, LazyExoticComponent<ComponentType>> = {
	home: lazy(() => import("tabs/home")),
	terminals: lazy(() => import("tabs/terminal")),
	agents: lazy(() => import("tabs/agents")),
	projects: lazy(() => import("tabs/projects")),
	more: lazy(() => import("tabs/more")),
	browser: lazy(() => import("tabs/home")),
};

let pageHandler: PushHandler | null = null;
let closePageHandler: ((id: string) => void) | null = null;
let currentTab: TabId = "home";
let tabViewHidden = false;
let handleTabChange: (tab: TabId) => void;

export default function App() {
	const [pageStack, setPageStack] = useState<PageStackEntry[]>([]);
	const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
	const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

	useEffect(() => {
		store.get<boolean>(ONBOARDING_KEY).then((val) => {
			setShowOnboarding(!val);
		});
	}, []);

	const handleOnboardingComplete = useCallback(() => {
		store.set(ONBOARDING_KEY, true);
		setShowOnboarding(false);
	}, []);

	const popPage = useCallback((id: string) => {
		setClosingIds((prev) => new Set(prev).add(id));
		setTimeout(() => {
			setPageStack((prev) => prev.filter((entry) => entry.id !== id));
			setClosingIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}, PAGE_HIDE_DURATION);
	}, []);

	useEffect(() => {
		pageHandler = (id, element, showConnectionBanner) => {
			setPageStack((prev) => [...prev, { id, element, showConnectionBanner }]);
			actionStack.push({
				id,
				action: () => popPage(id),
			});
		};
		closePageHandler = (id) => {
			actionStack.remove(id);
			popPage(id);
		};
	}, [popPage]);

	if (showOnboarding === null) {
		return null;
	}

	if (showOnboarding) {
		return (
			<ShellularProvider>
				<OnboardingPage onComplete={handleOnboardingComplete} />
			</ShellularProvider>
		);
	}

	const topNonClosingPage = [...pageStack]
		.reverse()
		.find((p) => !closingIds.has(p.id));

	tabViewHidden = pageStack.some((p) => !closingIds.has(p.id));

	return (
		<ShellularProvider>
			<TabView />
			<AppDialogHost />
			{pageStack.map(({ id, element, showConnectionBanner }) => {
				const isClosing = closingIds.has(id);
				const isVisible = id === topNonClosingPage?.id || isClosing;
				return (
					<div
						key={id}
						className={`page-overlay${isClosing ? " closing" : ""}`}
						style={{ display: isVisible ? undefined : "none" }}
					>
						{element}
						{!isClosing && showConnectionBanner && <ConnectionStatus />}
					</div>
				);
			})}
		</ShellularProvider>
	);
}

function TabView() {
	const [activeTab, setActiveTab] = useState<TabId>(currentTab);
	const prevTabRef = useRef<TabId>(currentTab);
	const TabContent = TABS_MAP[activeTab];
	const { savedHosts } = useShellular();

	handleTabChange = useCallback((newTab: TabId) => {
		if (newTab === "browser") {
			browser.open().catch(console.error);
			return;
		}
		const prevTab = prevTabRef.current;
		if (newTab === prevTab) return;
		actionStack.push({
			id: `tab-${newTab}`,
			action: () => {
				prevTabRef.current = prevTab;
				setActiveTab(prevTab);
			},
		});
		prevTabRef.current = newTab;
		setActiveTab(newTab);
		currentTab = newTab;
	}, []);

	return (
		<div
			className="tab-view"
			style={{ display: tabViewHidden ? "none" : undefined }}
		>
			<div className="tab-view-content">
				<Suspense
					fallback={<EmptyState mascot="loading" message="loading..." />}
				>
					<TabContent />
				</Suspense>
			</div>
			{savedHosts.length > 0 && (
				<TabBar activeTab={activeTab} onTabChange={handleTabChange} />
			)}
		</div>
	);
}

interface TabBarProps {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
}

function TabBar({ activeTab, onTabChange }: TabBarProps) {
	const [isStreaming, setIsStreaming] = useState(getHasAnyStreaming());

	useEffect(
		() =>
			listenToSessionStreamingEvent(() => {
				setIsStreaming(getHasAnyStreaming());
			}),
		[],
	);

	return (
		<nav className="tab-bar">
			{TABS.map(({ id, label, icon }) => {
				const isActive = activeTab === id;
				const showBadge = id === "agents" && isStreaming;
				return (
					<button
						key={id}
						type="button"
						className={`tab-item haptic-trigger${isActive ? " active" : ""}`}
						onClick={() => onTabChange(id)}
						aria-label={label}
					>
						<span className={`icon-${icon}${showBadge ? " badge" : ""}`}></span>
						<span className="tab-label">{label}</span>
					</button>
				);
			})}
		</nav>
	);
}

type PushHandler = (
	id: string,
	element: ReactElement,
	showConnectionBanner: boolean,
) => void;

export function pushPage(
	id: string,
	element: ReactElement,
	options?: { showConnectionBanner?: boolean },
): void {
	pageHandler?.(id, element, options?.showConnectionBanner ?? true);
}

export function closePage(id: string): void {
	closePageHandler?.(id);
}

export function toToTab(tabId: TabId): void {
	if (currentTab === tabId) return;
	handleTabChange(tabId);
}
