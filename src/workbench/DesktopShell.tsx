import "./desktop.scss";
import dialog from "bridge/dialog";
import AccountAvatarButton from "components/AccountAvatarButton";
import { getAgentIcon } from "lib/agents";
import { chatTabId } from "lib/chatTabId";
import { textifyEmoji } from "lib/emoji";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import appLogo from "res/logo.svg";
import { useShellular } from "state";
import { type ChatTab, getChatTabs, subscribeChatTabs } from "state/chatTabs";
import { getHostInfo } from "state/connection";
import AgentsTab from "tabs/agents";
import HomeTab from "tabs/home";
import { setWorkbenchOpenHandler } from "./navigation";
import ProjectSidebar from "./ProjectSidebar";
import SurfaceRenderer from "./SurfaceRenderer";
import {
	activateWorkbenchSurface,
	closeWorkbenchSurface,
	getWorkbenchSnapshot,
	openWorkbenchSurface,
	pruneWorkbenchTerminals,
	restoreWorkbench,
	subscribeWorkbench,
} from "./store";
import type { UtilityPage, WorkbenchSurface } from "./types";

type Activity = "home" | "agents" | "projects" | "more";
const SIDEBAR_WIDTH_KEY = "shellular:desktop-sidebar-width";
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;

const ACTIVITIES: Array<{ id: Activity; label: string; icon: string }> = [
	{ id: "home", label: "Home", icon: "icon-home" },
	{ id: "agents", label: "Agents", icon: "icon-ai-chat" },
	{ id: "projects", label: "Projects", icon: "icon-code" },
];

export default function DesktopShell({
	showBrowserTitlebar = process.env.IS_BROWSER,
}: {
	showBrowserTitlebar?: boolean;
} = {}) {
	const workbench = useSyncExternalStore(
		subscribeWorkbench,
		getWorkbenchSnapshot,
	);
	const {
		activeTerminals,
		connectionStatus,
		createTerminal,
		closeTerminal,
		terminalsRestoring,
		terminalNames,
		terminalProcesses,
	} = useShellular();
	const [activity, setActivity] = useState<Activity>("home");
	const [collapsed, setCollapsed] = useState(false);
	const [compact, setCompact] = useState(() => window.innerWidth < 900);
	const [width, setWidth] = useState(() => {
		const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
		return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 300;
	});
	const resizingRef = useRef(false);
	const observedRestoreRef = useRef(false);
	const activeTabRef = useRef<HTMLButtonElement>(null);
	const activeSurface = workbench.tabs.find(
		(surface) => surface.id === workbench.activeId,
	);

	useEffect(() => {
		setWorkbenchOpenHandler(openWorkbenchSurface);
		return () => setWorkbenchOpenHandler(null);
	}, []);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 899px)");
		const update = () => {
			setCompact(media.matches);
			if (media.matches) setCollapsed(true);
		};
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !collapsed) setCollapsed(true);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [collapsed]);

	useEffect(() => {
		if (!workbench.activeId) return;
		const frame = requestAnimationFrame(() => {
			activeTabRef.current?.scrollIntoView({
				block: "nearest",
				inline: "nearest",
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [workbench.activeId]);

	useEffect(() => {
		if (connectionStatus !== "connected") return;
		const hostId = getHostInfo()?.id;
		if (hostId) restoreWorkbench(hostId).catch(console.error);
	}, [connectionStatus]);

	useEffect(() => {
		if (terminalsRestoring) {
			observedRestoreRef.current = true;
			return;
		}
		if (!observedRestoreRef.current || connectionStatus !== "connected") return;
		pruneWorkbenchTerminals(
			new Set(activeTerminals.map((terminal) => terminal.terminalId)),
		);
		observedRestoreRef.current = false;
	}, [activeTerminals, connectionStatus, terminalsRestoring]);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			if (!resizingRef.current) return;
			const next = Math.min(
				SIDEBAR_MAX,
				Math.max(SIDEBAR_MIN, event.clientX - 48),
			);
			setWidth(next);
		};
		const onUp = () => {
			if (!resizingRef.current) return;
			resizingRef.current = false;
			localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
			document.body.style.cursor = "";
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
	}, [width]);

	const chooseActivity = (next: Activity) => {
		if (activity === next && !collapsed) {
			setCollapsed(true);
			return;
		}
		setActivity(next);
		setCollapsed(false);
	};

	const newTerminal = async () => {
		const terminalId = await createTerminal();
		if (!terminalId) return;
		openWorkbenchSurface({
			kind: "terminal",
			id: `terminal:${terminalId}`,
			title: "Terminal",
			icon: "icon-terminal",
			terminalId,
		});
	};

	const closeSurface = useCallback(
		async (surface: WorkbenchSurface) => {
			if (surface.kind === "terminal") {
				const live = activeTerminals.some(
					(terminal) => terminal.terminalId === surface.terminalId,
				);
				if (live) {
					const confirmed = await dialog.confirm(
						"Close this tab and kill the terminal process?",
						"Close Terminal",
					);
					if (!confirmed) return;
					closeTerminal(surface.terminalId);
				}
			}
			await closeWorkbenchSurface(surface.id);
		},
		[activeTerminals, closeTerminal],
	);

	return (
		<div className="desktop-frame">
			{showBrowserTitlebar && (
				<header className="browser-workbench-titlebar">
					<div className="browser-workbench-brand">
						<img className="browser-workbench-logo" src={appLogo} alt="" />
						<span>Shellular</span>
					</div>
					<div className="browser-workbench-title">
						<span>
							{activeSurface
								? surfaceTitle(activeSurface, terminalNames, terminalProcesses)
								: "Workbench"}
						</span>
					</div>
					<div aria-hidden="true" />
				</header>
			)}
			<div className="desktop-workbench">
				<nav className="workbench-activity-bar" aria-label="Workspace sections">
					<div className="workbench-activity-main">
						{ACTIVITIES.map((item) => (
							<ActivityButton
								key={item.id}
								item={item}
								active={activity === item.id && !collapsed}
								onClick={() => chooseActivity(item.id)}
							/>
						))}
					</div>
					<div className="workbench-activity-footer">
						<ActivityButton
							item={{ id: "more", label: "More", icon: "icon-grid" }}
							active={activity === "more" && !collapsed}
							onClick={() => chooseActivity("more")}
						/>
						<button
							type="button"
							className="workbench-activity-button"
							onClick={() => openUtility("settings")}
							aria-label="Settings"
							title="Settings"
						>
							<span className="icon-settings" />
						</button>
						<AccountAvatarButton
							className="workbench-account-avatar"
							onClick={() => openUtility("account")}
						/>
					</div>
				</nav>

				{!collapsed && (
					<aside
						className={`workbench-sidebar${compact ? " is-compact" : ""}`}
						style={{ width }}
					>
						<div className="workbench-sidebar-content">
							{activity === "home" && <HomeTab showAccount={false} />}
							{activity === "agents" && <AgentsTab compact />}
							{activity === "projects" && <ProjectSidebar />}
							{activity === "more" && <MoreSidebar />}
						</div>
						{!compact && (
							<div
								className="workbench-sidebar-resizer"
								onPointerDown={() => {
									resizingRef.current = true;
									document.body.style.cursor = "col-resize";
								}}
							/>
						)}
					</aside>
				)}
				{compact && !collapsed && (
					<button
						className="workbench-sidebar-backdrop"
						type="button"
						aria-label="Close sidebar"
						onClick={() => setCollapsed(true)}
					/>
				)}

				<main className="workbench-main">
					<div
						className="workbench-tab-strip"
						role="tablist"
						aria-label="Open views"
					>
						<div
							className="workbench-tabs-scroll"
							onWheel={(event) => {
								if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
								if (
									event.currentTarget.scrollWidth <=
									event.currentTarget.clientWidth
								)
									return;
								event.currentTarget.scrollLeft += event.deltaY;
								event.preventDefault();
							}}
						>
							{workbench.tabs.map((surface) => (
								<div
									key={surface.id}
									className={`workbench-tab${workbench.activeId === surface.id ? " active" : ""}`}
								>
									<button
										ref={
											workbench.activeId === surface.id
												? activeTabRef
												: undefined
										}
										type="button"
										role="tab"
										aria-selected={workbench.activeId === surface.id}
										onClick={() => activateWorkbenchSurface(surface.id)}
									>
										<span className={surface.icon} />
										<span>
											{surfaceTitle(surface, terminalNames, terminalProcesses)}
										</span>
									</button>
									<button
										type="button"
										className="workbench-tab-close"
										aria-label={`Close ${surface.title}`}
										onClick={() => closeSurface(surface)}
									>
										<span className="icon-x" />
									</button>
								</div>
							))}
						</div>
						<button
							type="button"
							className="workbench-new-terminal"
							onClick={newTerminal}
							aria-label="New terminal"
							title="New terminal"
						>
							<span className="icon-plus" />
						</button>
					</div>
					<div className="workbench-editor-area">
						{workbench.tabs.length === 0 && (
							<WorkbenchWelcome
								onNewTerminal={newTerminal}
								onOpenProjects={() => chooseActivity("projects")}
							/>
						)}
						{workbench.tabs.map((surface) => (
							<section
								key={surface.id}
								className="workbench-surface"
								aria-hidden={workbench.activeId !== surface.id}
								style={{
									display:
										workbench.activeId === surface.id ? undefined : "none",
								}}
							>
								<SurfaceRenderer surface={surface} />
							</section>
						))}
					</div>
				</main>
			</div>
		</div>
	);
}

function ActivityButton({
	item,
	active,
	onClick,
}: {
	item: { id: Activity; label: string; icon: string };
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={`workbench-activity-button${active ? " active" : ""}`}
			onClick={onClick}
			aria-label={item.label}
			title={item.label}
		>
			<span className={item.icon} />
		</button>
	);
}

function WorkbenchWelcome({
	onNewTerminal,
	onOpenProjects,
}: {
	onNewTerminal: () => void;
	onOpenProjects: () => void;
}) {
	const { agents, projects } = useShellular();
	const [recent, setRecent] = useState<
		Array<ChatTab & { projectPath: string }>
	>([]);
	useEffect(() => {
		const refresh = () => {
			setRecent(
				projects
					.flatMap((project) =>
						getChatTabs(project.path).map((tab) => ({
							...tab,
							projectPath: project.path,
						})),
					)
					.sort((a, b) => b.updatedAt - a.updatedAt)
					.slice(0, 5),
			);
		};
		refresh();
		return subscribeChatTabs(refresh);
	}, [projects]);
	const firstAgent = Object.values(agents).find((agent) => agent.available);
	const firstProject = projects[0];
	const openRecent = (tab: ChatTab & { projectPath: string }) => {
		openWorkbenchSurface({
			kind: "chat",
			id: tab.id,
			title: tab.title,
			icon: getAgentIcon(tab.agentId),
			agentId: tab.agentId,
			sessionId: tab.sessionId,
			workspacePath: tab.projectPath,
			createOnFirstMessage: !tab.sessionId,
		});
	};
	return (
		<div className="workbench-welcome">
			<span className="icon-shellular workbench-welcome-logo" />
			<h1>Shellular</h1>
			<p>Your projects, agents, chats, and terminals in one workspace.</p>
			<div className="workbench-welcome-actions">
				<button type="button" onClick={onNewTerminal}>
					<span className="icon-terminal" />
					New Terminal
				</button>
				<button
					type="button"
					onClick={() => {
						if (!firstAgent || !firstProject) return onOpenProjects();
						const id = chatTabId(firstAgent.id, "");
						openWorkbenchSurface({
							kind: "chat",
							id,
							title: "New Chat",
							icon: getAgentIcon(firstAgent.id),
							agentId: firstAgent.id,
							sessionId: "",
							workspacePath: firstProject.path,
							createOnFirstMessage: true,
						});
					}}
				>
					<span className="icon-ai-chat" />
					New Chat
				</button>
				<button type="button" onClick={onOpenProjects}>
					<span className="icon-folder" />
					Open Project
				</button>
				<button type="button" onClick={() => openUtility("settings")}>
					<span className="icon-settings" />
					Settings
				</button>
			</div>
			{recent.length > 0 && (
				<div className="workbench-recent">
					<h2>Recent chats</h2>
					{recent.map((tab) => (
						<button type="button" key={tab.id} onClick={() => openRecent(tab)}>
							<span className={getAgentIcon(tab.agentId)} />
							<span>{tab.title}</span>
							<small>{tab.projectPath.split("/").pop()}</small>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function MoreSidebar() {
	const items: Array<{
		page: UtilityPage;
		label: string;
		description: string;
		icon: string;
	}> = [
		{
			page: "ports",
			label: "Ports",
			description: "Manage forwarded services",
			icon: "icon-power-cord",
		},
		{
			page: "system-monitor",
			label: "System Monitor",
			description: "Connected host performance",
			icon: "icon-activity",
		},
		{
			page: "reach-out",
			label: "Reach Out",
			description: "Contact the Shellular team",
			icon: "icon-message-circle",
		},
		{
			page: "about",
			label: "About",
			description: "Version and licenses",
			icon: "icon-info",
		},
	];
	return (
		<div className="workbench-more-list">
			{items.map((item) => (
				<button
					type="button"
					key={item.page}
					onClick={() => openUtility(item.page)}
				>
					<span className={item.icon} />
					<span>
						<strong>{item.label}</strong>
						<small>{item.description}</small>
					</span>
				</button>
			))}
		</div>
	);
}

function openUtility(page: UtilityPage) {
	const metadata: Record<
		UtilityPage,
		{ title: string; icon: string; showConnectionBanner: boolean }
	> = {
		settings: {
			title: "Settings",
			icon: "icon-settings",
			showConnectionBanner: false,
		},
		ports: {
			title: "Ports",
			icon: "icon-power-cord",
			showConnectionBanner: false,
		},
		about: { title: "About", icon: "icon-info", showConnectionBanner: false },
		"reach-out": {
			title: "Reach Out",
			icon: "icon-message-circle",
			showConnectionBanner: false,
		},
		account: {
			title: "Account",
			icon: "icon-user",
			showConnectionBanner: false,
		},
		"system-monitor": {
			title: "System Monitor",
			icon: "icon-activity",
			showConnectionBanner: true,
		},
	};
	openWorkbenchSurface({
		kind: "utility",
		id: `utility:${page}`,
		page,
		...metadata[page],
	});
}

function surfaceTitle(
	surface: WorkbenchSurface,
	names: Record<string, string>,
	processes: Record<string, { name: string } | null>,
) {
	if (surface.kind !== "terminal") return surface.title;
	return textifyEmoji(
		names[surface.terminalId] ||
			processes[surface.terminalId]?.name ||
			"Terminal",
	);
}
