import "./desktop.scss";
import browser from "bridge/browser";
import dialog from "bridge/dialog";
import native, { type DesktopCommand } from "bridge/native";
import LocalCliDashboard from "components/LocalCliDashboard";
import ContextMenuHost from "context-menu/ContextMenuHost";
import { showContextMenuForEvent } from "context-menu/service";
import { getAgentIcon } from "lib/agents";
import { copyToClipboard } from "lib/clipboard";
import { textifyEmoji } from "lib/emoji";
import { redirectVerticalWheelToHorizontal } from "lib/horizontalWheel";
import toast from "lib/toast";
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
import {
	getConnectionSnapshot,
	getHostInfo,
	subscribeState,
} from "state/connection";
import { getLocalCliSnapshot, subscribeLocalCli } from "state/localCli";
import HomeTab from "tabs/home";
import useProjectPicker from "tabs/projects/useProjectPicker";
import themes from "themes";
import { openBrowserSurface } from "./browserSurface";
import DesktopDialogHost from "./DesktopDialogHost";
import DesktopGitSidebar from "./DesktopGitSidebar";
import DesktopMenuBar, { type DesktopMenuCommand } from "./DesktopMenuBar";
import DesktopProfileMenu from "./DesktopProfileMenu";
import { subscribeDesktopGitFocus } from "./desktopGitNavigation";
import {
	canRunDomEditCommand,
	runDomEditCommand,
	type WorkbenchEditCommand,
} from "./domEditCommands";
import { useDesktopGitWorkspace } from "./gitWorkspace";
import NewChatDialog from "./NewChatDialog";
import { setWorkbenchOpenHandler } from "./navigation";
import { requestNewChat, subscribeNewChat } from "./newChat";
import ProjectSidebar from "./ProjectSidebar";
import {
	WorkbenchPageChromeProvider,
	type WorkbenchPageChromeTargets,
} from "./pageChrome";
import {
	ShellularFileIcon,
	ShellularFileIconSprite,
	TREE_ICON_THEME_STYLE,
} from "./ShellularFileIcon";
import SidebarResizeHandle from "./SidebarResizeHandle";
import SurfaceRenderer from "./SurfaceRenderer";
import {
	activateWorkbenchSurface,
	canExecuteWorkbenchSurfaceCommand,
	closeWorkbenchSurface,
	executeWorkbenchSurfaceCommand,
	getWorkbenchCommandRevision,
	getWorkbenchSnapshot,
	openWorkbenchDialog,
	openWorkbenchSurface,
	pruneWorkbenchTerminals,
	restoreWorkbench,
	saveWorkbenchSurface,
	subscribeWorkbench,
	subscribeWorkbenchCommands,
} from "./store";
import { createEditorSurface, utilityMetadata } from "./surfaces";
import type { UtilityPage, WorkbenchSurface } from "./types";
import {
	formatWorkbenchDocumentTitle,
	resolveWorkbenchContextTitle,
} from "./windowTitle";

type PrimaryActivity = "home" | "remote" | "projects" | "git";
const SIDEBAR_WIDTH_KEY = "shellular:desktop-sidebar-width";
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;

const ACTIVITIES: Array<{ id: PrimaryActivity; label: string; icon: string }> =
	[
		{
			id: "home",
			label: "Home",
			icon: "icon-home",
		},
		{
			id: "remote",
			label: "Remote Access",
			icon: "icon-radio",
		},
		{ id: "projects", label: "Projects", icon: "icon-code" },
		{ id: "git", label: "Source Control", icon: "icon-git-branch" },
	];

export default function DesktopShell({
	showDesktopTitlebar = process.env.IS_DESKTOP_UI,
}: {
	showDesktopTitlebar?: boolean;
} = {}) {
	const workbench = useSyncExternalStore(
		subscribeWorkbench,
		getWorkbenchSnapshot,
	);
	const localCliState = useSyncExternalStore(
		subscribeLocalCli,
		getLocalCliSnapshot,
	);
	const commandRevision = useSyncExternalStore(
		subscribeWorkbenchCommands,
		getWorkbenchCommandRevision,
	);
	const {
		activeTerminals,
		connectionStatus,
		createTerminal,
		closeTerminal,
		terminalsRestoring,
		terminalNames,
		terminalProcesses,
		agents,
		projects,
	} = useShellular();
	const [activity, setActivity] = useState<PrimaryActivity>("home");
	const [showNewChat, setShowNewChat] = useState(false);
	const [newChatProjectPath, setNewChatProjectPath] = useState<string>();
	const [gitFocusRequest, setGitFocusRequest] = useState<{
		projectPath: string;
		id: number;
	}>();
	const [collapsed, setCollapsed] = useState(false);
	const [compact, setCompact] = useState(() => window.innerWidth < 900);
	const [chromeTargets, setChromeTargets] =
		useState<WorkbenchPageChromeTargets>({
			title: null,
			actions: null,
			navigation: null,
		});
	const [width, setWidth] = useState(() => {
		const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
		return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 300;
	});
	const { openProjectPicker } = useProjectPicker();
	const observedRestoreRef = useRef(false);
	const activeTabRef = useRef<HTMLButtonElement>(null);
	const lastFocusedElementRef = useRef<HTMLElement | null>(null);
	const nativeCommandHandlerRef = useRef<(command: DesktopCommand) => void>(
		() => {},
	);
	const [, setFocusRevision] = useState(0);
	const gitWorkspace = useDesktopGitWorkspace();
	const activeSurface = workbench.tabs.find(
		(surface) => surface.id === workbench.activeId,
	);
	const activeSurfaceTitle = activeSurface
		? surfaceTitle(activeSurface, terminalNames, terminalProcesses)
		: undefined;
	const contextTitle = resolveWorkbenchContextTitle(
		activeSurface,
		projects,
		activeSurfaceTitle,
		activity,
	);
	const setChromeTarget = useCallback(
		(key: keyof WorkbenchPageChromeTargets, element: HTMLElement | null) => {
			setChromeTargets((current) =>
				current[key] === element ? current : { ...current, [key]: element },
			);
		},
		[],
	);
	const setChromeNavigationTarget = useCallback(
		(element: HTMLElement | null) => setChromeTarget("navigation", element),
		[setChromeTarget],
	);
	const setChromeTitleTarget = useCallback(
		(element: HTMLElement | null) => setChromeTarget("title", element),
		[setChromeTarget],
	);
	const setChromeActionsTarget = useCallback(
		(element: HTMLElement | null) => setChromeTarget("actions", element),
		[setChromeTarget],
	);

	useEffect(() => {
		if (!process.env.IS_MACOS) return;
		void browser.syncConnectionContext();
		const unsubscribeConnection = subscribeState(() => {
			void browser.syncConnectionContext();
		});
		const unsubscribeTheme = themes.subscribe(() => {
			void browser.syncTheme();
		});
		return () => {
			unsubscribeConnection();
			unsubscribeTheme();
		};
	}, []);

	useEffect(() => {
		const platform = process.env.IS_MACOS ? "macos" : "browser";
		document.title = formatWorkbenchDocumentTitle(contextTitle, platform);
		if (process.env.IS_MACOS) {
			void native.setWindowTitle(contextTitle).catch(console.error);
		}
	}, [contextTitle]);

	useEffect(() => {
		const updateFocus = (event: FocusEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			if (target.closest(".desktop-workbench-titlebar")) return;
			lastFocusedElementRef.current = target;
			setFocusRevision((value) => value + 1);
		};
		const updateSelection = () => setFocusRevision((value) => value + 1);
		document.addEventListener("focusin", updateFocus);
		document.addEventListener("selectionchange", updateSelection);
		return () => {
			document.removeEventListener("focusin", updateFocus);
			document.removeEventListener("selectionchange", updateSelection);
		};
	}, []);

	useEffect(() => {
		return subscribeNewChat(({ projectPath }) => {
			setNewChatProjectPath(projectPath);
			setShowNewChat(true);
		});
	}, []);

	useEffect(() => {
		setWorkbenchOpenHandler((surface, options) => {
			if (options?.presentation === "dialog") openWorkbenchDialog(surface);
			else openWorkbenchSurface(surface);
		});
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

	const showActivity = useCallback((next: PrimaryActivity) => {
		setActivity(next);
		setCollapsed(false);
	}, []);

	useEffect(
		() =>
			subscribeDesktopGitFocus((projectPath) => {
				if (projectPath) {
					setGitFocusRequest((current) => ({
						projectPath,
						id: (current?.id ?? 0) + 1,
					}));
				}
				showActivity("git");
			}),
		[showActivity],
	);

	const chooseActivity = (next: PrimaryActivity) => {
		if (activity === next && !collapsed) {
			setCollapsed(true);
			return;
		}
		showActivity(next);
	};

	const newTerminal = useCallback(async () => {
		const terminalId = await createTerminal();
		if (!terminalId) return;
		openWorkbenchSurface({
			kind: "terminal",
			id: `terminal:${terminalId}`,
			title: "Terminal",
			icon: "icon-terminal",
			terminalId,
		});
	}, [createTerminal]);

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
					if (!confirmed) return false;
					closeTerminal(surface.terminalId);
				}
			}
			return closeWorkbenchSurface(surface.id);
		},
		[activeTerminals, closeTerminal],
	);
	const closeSurfaces = useCallback(
		async (surfaces: WorkbenchSurface[]) => {
			for (const surface of surfaces) {
				if (!(await closeSurface(surface))) return false;
			}
			return true;
		},
		[closeSurface],
	);

	const runDesktopMenuCommand = useCallback(
		async (command: DesktopMenuCommand) => {
			const snapshot = getWorkbenchSnapshot();
			const editCommands: Partial<
				Record<DesktopMenuCommand, WorkbenchEditCommand>
			> = {
				undo: "undo",
				redo: "redo",
				cut: "cut",
				copy: "copy",
				paste: "paste",
				"select-all": "select-all",
			};
			const editCommand = editCommands[command];
			if (editCommand) {
				if (
					await executeWorkbenchSurfaceCommand(snapshot.activeId, editCommand)
				)
					return;
				try {
					await runDomEditCommand(editCommand, lastFocusedElementRef.current);
				} catch (error) {
					console.warn(`Desktop ${command} command failed`, error);
					toast(
						`${command[0].toUpperCase()}${command.slice(1)} is unavailable`,
						3000,
					);
				}
				return;
			}

			switch (command) {
				case "new-chat":
					requestNewChat();
					break;
				case "new-terminal":
					await newTerminal();
					break;
				case "open-folder":
					openProjectPicker();
					showActivity("projects");
					break;
				case "save":
					await saveWorkbenchSurface(snapshot.activeId);
					break;
				case "close-tab": {
					const surface = snapshot.tabs.find(
						(candidate) => candidate.id === snapshot.activeId,
					);
					if (surface) await closeSurface(surface);
					break;
				}
				case "toggle-sidebar":
					setCollapsed((value) => !value);
					break;
				case "ports":
					openUtility("ports");
					break;
				case "system-monitor":
					openUtility("system-monitor");
					break;
				case "help":
					await openBrowserSurface(
						"https://shellular.dev/docs",
						"Shellular Help",
					);
					break;
				case "reach-out":
					openUtility("reach-out");
					break;
				case "about":
					openUtility("about");
					break;
				case "undo":
				case "redo":
				case "cut":
				case "copy":
				case "paste":
				case "select-all":
					break;
			}
		},
		[closeSurface, newTerminal, openProjectPicker, showActivity],
	);

	const isDesktopMenuCommandEnabled = useCallback(
		(command: DesktopMenuCommand) => {
			void commandRevision;
			const activeId = getWorkbenchSnapshot().activeId;
			if (command === "save") {
				return canExecuteWorkbenchSurfaceCommand(activeId, "save");
			}
			if (command === "close-tab") return Boolean(activeId);
			if (
				command === "undo" ||
				command === "redo" ||
				command === "cut" ||
				command === "copy" ||
				command === "paste" ||
				command === "select-all"
			) {
				return (
					canExecuteWorkbenchSurfaceCommand(activeId, command) ||
					canRunDomEditCommand(command, lastFocusedElementRef.current)
				);
			}
			return true;
		},
		[commandRevision],
	);
	const persistSidebarWidth = useCallback((nextWidth: number) => {
		localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
	}, []);

	nativeCommandHandlerRef.current = (command) => {
		if (command === "settings") {
			openUtility("settings");
			return;
		}
		if (command === "open-file") {
			if (getConnectionSnapshot().transport !== "local") {
				void dialog.message(
					"Open File uses the connected remote file browser on remote hosts.",
					"Remote Workspace",
				);
				return;
			}
			void native.pickLocalFiles(getHostInfo()?.dir).then((paths) => {
				for (const path of paths) {
					openWorkbenchSurface(
						createEditorSurface({
							id: `editor:${path}`,
							filePath: path,
						}),
					);
				}
			});
			return;
		}
		void runDesktopMenuCommand(command);
	};

	useEffect(() => {
		if (!process.env.IS_DESKTOP_UI) return;
		return native.setDesktopCommandHandler((command) =>
			nativeCommandHandlerRef.current(command),
		);
	}, []);

	useEffect(() => {
		if (!process.env.IS_BROWSER) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
			const key = event.key.toLowerCase();
			if (key === "s") {
				event.preventDefault();
				void runDesktopMenuCommand("save");
			} else if (key === "b") {
				event.preventDefault();
				void runDesktopMenuCommand("toggle-sidebar");
			} else if (key === "w" && getWorkbenchSnapshot().activeId) {
				event.preventDefault();
				void runDesktopMenuCommand("close-tab");
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [runDesktopMenuCommand]);

	return (
		<div className="desktop-frame" style={TREE_ICON_THEME_STYLE}>
			<ShellularFileIconSprite />
			{showDesktopTitlebar && (
				<header
					className={`desktop-workbench-titlebar ${process.env.IS_MACOS ? "is-macos" : "is-browser"}`}
				>
					<div className="desktop-workbench-titlebar-start">
						{!process.env.IS_MACOS && (
							<>
								<div className="browser-workbench-brand">
									<img
										className="browser-workbench-logo"
										src={appLogo}
										alt=""
									/>
									<span>Shellular</span>
								</div>
								<DesktopMenuBar
									onCommand={runDesktopMenuCommand}
									isCommandEnabled={isDesktopMenuCommandEnabled}
								/>
							</>
						)}
					</div>
					<div className="desktop-workbench-context" title={contextTitle}>
						<span>{contextTitle}</span>
					</div>
					<div aria-hidden="true" />
				</header>
			)}
			<div className="desktop-workbench">
				<nav className="workbench-activity-bar" aria-label="Workspace sections">
					<div className="workbench-activity-main">
						{ACTIVITIES.filter(
							(item) =>
								item.id !== "remote" || localCliState.capability?.available,
						).map((item) => (
							<ActivityButton
								key={item.id}
								item={item}
								active={activity === item.id && !collapsed}
								onClick={() => chooseActivity(item.id)}
								badge={
									item.id === "git" ? gitWorkspace.totalChanges : undefined
								}
							/>
						))}
						{process.env.IS_MACOS && (
							<CommandButton
								label="Browser"
								icon="icon-globe"
								onClick={() => void browser.open()}
							/>
						)}
					</div>
					<div className="workbench-activity-footer">
						<DesktopProfileMenu onOpen={(page) => openUtility(page)} />
					</div>
				</nav>

				{!collapsed && (
					<aside
						className={`workbench-sidebar${compact ? " is-compact" : ""}`}
						style={{ width }}
					>
						<div className="workbench-sidebar-content">
							{activity === "remote" && <LocalCliDashboard />}
							{activity === "home" && <HomeTab showAccount={false} />}
							{activity === "projects" && <ProjectSidebar />}
							{activity === "git" && (
								<DesktopGitSidebar
									workspace={gitWorkspace}
									focusRequest={gitFocusRequest}
								/>
							)}
						</div>
					</aside>
				)}
				{!collapsed && !compact && (
					<SidebarResizeHandle
						value={width}
						min={SIDEBAR_MIN}
						max={SIDEBAR_MAX}
						onResize={setWidth}
						onResizeEnd={persistSidebarWidth}
					/>
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
					<div className="workbench-tab-strip">
						<div
							className="workbench-tabs-scroll"
							role="tablist"
							aria-label="Open views"
							onWheel={(event) => {
								redirectVerticalWheelToHorizontal(event);
							}}
						>
							{workbench.tabs.map((surface) => (
								<div
									key={surface.id}
									className={`workbench-tab${workbench.activeId === surface.id ? " active" : ""}${surface.dirty ? " is-dirty" : ""}`}
									onContextMenu={(event) => {
										const index = workbench.tabs.findIndex(
											(candidate) => candidate.id === surface.id,
										);
										const path =
											surface.kind === "editor" ? surface.filePath : null;
										void showContextMenuForEvent(event, {
											menuId: "workbench-tab",
											target: {
												handlers: {
													"tab.close": { run: () => closeSurface(surface) },
													"tab.closeOthers": {
														run: () =>
															closeSurfaces(
																workbench.tabs.filter(
																	(candidate) => candidate.id !== surface.id,
																),
															),
														enabled: workbench.tabs.length > 1,
													},
													"tab.closeRight": {
														run: () =>
															closeSurfaces(workbench.tabs.slice(index + 1)),
														enabled:
															index >= 0 && index < workbench.tabs.length - 1,
													},
													"tab.closeAll": {
														run: () => closeSurfaces([...workbench.tabs]),
														enabled: workbench.tabs.length > 0,
													},
													"resource.copyPath": {
														run: () => path && copyToClipboard({ text: path }),
														visible: Boolean(path),
													},
													"resource.reveal": {
														run: () => path && native.revealLocalPath(path),
														visible: Boolean(
															path &&
																getConnectionSnapshot().transport === "local",
														),
													},
												},
											},
										});
									}}
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
										{surface.kind === "editor" ? (
											<ShellularFileIcon
												path={surface.filePath}
												className="workbench-file-icon size-4 shrink-0"
											/>
										) : (
											<span className={surface.icon} />
										)}
										<span>
											{surfaceTitle(surface, terminalNames, terminalProcesses)}
										</span>
									</button>
									{workbench.activeId === surface.id ? (
										<button
											type="button"
											className="workbench-tab-close"
											aria-label={`Close ${surface.title}`}
											onClick={() => closeSurface(surface)}
										>
											{surface.dirty ? (
												<>
													<span className="workbench-tab-dirty-icon icon-circle" />
													<span className="workbench-tab-dirty-close icon-x" />
												</>
											) : (
												<span className="icon-x" />
											)}
										</button>
									) : surface.dirty ? (
										<span
											className="workbench-tab-dirty-indicator icon-circle"
											role="img"
											aria-label={`${surface.title} has unsaved changes`}
										/>
									) : null}
								</div>
							))}
						</div>
						<div
							className="workbench-page-title-target"
							ref={setChromeTitleTarget}
						/>
						<div
							className="workbench-page-nav-slot"
							ref={setChromeNavigationTarget}
						/>
						<div
							className="workbench-page-actions-target"
							ref={setChromeActionsTarget}
						/>
					</div>
					<div className="workbench-editor-area">
						{workbench.tabs.length === 0 && (
							<WorkbenchWelcome
								onNewTerminal={newTerminal}
								onNewChat={() => requestNewChat()}
								onOpenProject={() => {
									openProjectPicker();
									showActivity("projects");
								}}
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
								<WorkbenchPageChromeProvider
									active={workbench.activeId === surface.id}
									targets={chromeTargets}
								>
									<SurfaceRenderer surface={surface} />
								</WorkbenchPageChromeProvider>
							</section>
						))}
					</div>
				</main>
				<DesktopDialogHost surface={workbench.dialog} />
				<ContextMenuHost />
				{showNewChat && (
					<NewChatDialog
						hostId={getHostInfo()?.id ?? "local"}
						projects={projects}
						agents={Object.values(agents).filter((agent) => agent.available)}
						initialProjectPath={newChatProjectPath}
						onOpenFolder={openProjectPicker}
						onClose={() => {
							setShowNewChat(false);
							setNewChatProjectPath(undefined);
						}}
					/>
				)}
			</div>
		</div>
	);
}

function CommandButton({
	label,
	icon,
	active,
	onClick,
}: {
	label: string;
	icon: string;
	active?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={`workbench-activity-button${active ? " active" : ""}`}
			onClick={onClick}
			aria-label={label}
			title={label}
		>
			<span className={icon} />
		</button>
	);
}

function ActivityButton({
	item,
	active,
	onClick,
	badge,
}: {
	item: { id: PrimaryActivity; label: string; icon: string };
	active: boolean;
	onClick: () => void;
	badge?: number;
}) {
	return (
		<button
			type="button"
			className={`workbench-activity-button${active ? " active" : ""}`}
			onClick={onClick}
			aria-label={item.label}
			title={item.label}
			aria-description={
				badge ? `${badge} changed ${badge === 1 ? "file" : "files"}` : undefined
			}
		>
			<span className={item.icon} />
			{badge ? (
				<span
					className="absolute bottom-1 right-1 grid min-w-4 place-items-center rounded-full bg-button-background px-1 text-[9px] font-bold leading-4 text-button-text"
					aria-hidden="true"
				>
					{badge > 99 ? "99+" : badge}
				</span>
			) : null}
		</button>
	);
}

function WorkbenchWelcome({
	onNewTerminal,
	onNewChat,
	onOpenProject,
}: {
	onNewTerminal: () => void;
	onNewChat: () => void;
	onOpenProject: () => void;
}) {
	const { projects } = useShellular();
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
				<button type="button" onClick={onNewChat}>
					<span className="icon-ai-chat" />
					New Chat
				</button>
				<button type="button" onClick={onOpenProject}>
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

function openUtility(page: UtilityPage) {
	openWorkbenchSurface({
		kind: "utility",
		id: `utility:${page}`,
		page,
		...utilityMetadata[page],
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
