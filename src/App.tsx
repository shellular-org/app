import "./App.scss";
import browser from "bridge/browser";
import AppDialogHost from "components/AppDialog";
import ConnectionStatus from "components/ConnectionStatus";
import EmptyState from "components/EmptyState";
import actionStack from "lib/actionStack";
import { AuthProvider, useAuth } from "lib/auth";
import { ONBOARDING_KEY, resolveOnboardingVisibility } from "lib/onboarding";
import * as store from "lib/store";
import LoginPage from "pages/login";
import OnboardingPage from "pages/onboarding";
import SettingsPage from "pages/settings";
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
	useSyncExternalStore,
} from "react";
import { ShellularProvider } from "state";
import {
	getHasAnyStreaming,
	listenToSessionStreamingEvent,
} from "state/sessions";
import DesktopShell from "workbench/DesktopShell";
import { getWorkbenchSnapshot, subscribeWorkbench } from "workbench/store";

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

const PAGE_HIDE_DURATION = 240;
const LOGIN_SETTINGS_PAGE_ID = "login-settings";
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
		disabled: process.env.IS_DESKTOP_UI,
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
	return (
		<AuthProvider>
			<AuthGate />
		</AuthProvider>
	);
}

function AuthGate() {
	const { status } = useAuth();
	const [showLoginSettings, setShowLoginSettings] = useState(false);

	const openLoginSettings = useCallback(() => {
		if (actionStack.has(LOGIN_SETTINGS_PAGE_ID)) return;
		setShowLoginSettings(true);
		actionStack.push({
			id: LOGIN_SETTINGS_PAGE_ID,
			action: () => {
				setShowLoginSettings(false);
			},
		});
	}, []);

	useEffect(() => {
		if (status === "unauthenticated" || !showLoginSettings) return;
		actionStack.remove(LOGIN_SETTINGS_PAGE_ID);
		setShowLoginSettings(false);
	}, [showLoginSettings, status]);

	if (status === "loading") {
		return <EmptyState mascot="loading" message="loading..." />;
	}

	if (status === "unauthenticated") {
		return showLoginSettings ? (
			<SettingsPage />
		) : (
			<LoginPage onOpenSettings={openLoginSettings} />
		);
	}

	return <AuthenticatedApp />;
}

function AuthenticatedApp() {
	const [pageStack, setPageStack] = useState<PageStackEntry[]>([]);
	const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
	const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
	const workbench = useSyncExternalStore(
		subscribeWorkbench,
		getWorkbenchSnapshot,
	);

	useEffect(() => {
		resolveOnboardingVisibility({
			isMacos: process.env.IS_MACOS,
			readCompletion: () => store.get<boolean>(ONBOARDING_KEY),
		}).then(setShowOnboarding);
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
				action: () => {
					popPage(id);
				},
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

	// The reconnect overlay lives at the app root so it covers everything —
	// tabs and pushed pages alike. A pushed page can opt out (e.g. flows that
	// manage their own connection UI) via showConnectionBanner: false, which
	// only applies while that page is the top-most one.
	const activeWorkbenchSurface = workbench.surfaces.find(
		(surface) => surface.id === workbench.activeId,
	);
	const shellShowsConnectionOverlay = process.env.IS_DESKTOP_UI
		? (workbench.dialog ?? activeWorkbenchSurface)?.showConnectionBanner !==
			false
		: true;
	const showConnectionOverlay = topNonClosingPage
		? topNonClosingPage.showConnectionBanner
		: shellShowsConnectionOverlay;

	return (
		<ShellularProvider>
			{process.env.IS_DESKTOP_UI ? <DesktopShell /> : <MobileShell />}
			<AppDialogHost />
			{pageStack.map(({ id, element }) => {
				const isClosing = closingIds.has(id);
				const isVisible = id === topNonClosingPage?.id || isClosing;
				const overlayClass = `page-overlay${isClosing ? " closing" : ""}${process.env.IS_DESKTOP_UI ? " desktop-page-dialog-overlay" : ""}`;
				return (
					<div
						key={id}
						className={overlayClass}
						style={{ display: isVisible ? undefined : "none" }}
						onMouseDown={(event) => {
							if (!process.env.IS_DESKTOP_UI) return;
							if (event.target !== event.currentTarget) return;
							closePage(id);
						}}
					>
						{process.env.IS_DESKTOP_UI ? (
							<div className="desktop-pushed-page-shell">{element}</div>
						) : (
							element
						)}
					</div>
				);
			})}
			{showConnectionOverlay && <ConnectionStatus />}
		</ShellularProvider>
	);
}

function MobileShell() {
	const [activeTab, setActiveTab] = useState<TabId>(currentTab);
	const prevTabRef = useRef<TabId>(currentTab);
	const TabContent = TABS_MAP[activeTab];

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
			<TabBar activeTab={activeTab} onTabChange={handleTabChange} />
		</div>
	);
}

interface TabBarProps {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
}

function TabBar({ activeTab, onTabChange }: TabBarProps) {
	const [isStreaming, setIsStreaming] = useState(() => getHasAnyStreaming());

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
