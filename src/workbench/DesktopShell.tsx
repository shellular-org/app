import "./desktop.scss";
import browser from "bridge/browser";
import dialog from "bridge/dialog";
import native, { type DesktopCommand } from "bridge/native";
import LocalCliDashboard from "components/LocalCliDashboard";
import ContextMenuHost from "context-menu/ContextMenuHost";
import { textifyEmoji } from "lib/emoji";
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
import DesktopSecondarySidebar from "./DesktopSecondarySidebar";
import {
	canRunDomEditCommand,
	runDomEditCommand,
	type WorkbenchEditCommand,
} from "./domEditCommands";
import { useDesktopGitWorkspace } from "./gitWorkspace";
import { subscribeDesktopGitFocus } from "./desktopGitNavigation";
import { findWorkbenchTab } from "./layoutTree";
import NewChatDialog from "./NewChatDialog";
import { setWorkbenchOpenHandler } from "./navigation";
import { requestNewChat, subscribeNewChat } from "./newChat";
import ProjectSidebar from "./ProjectSidebar";
import {
	closeDesktopSecondarySidebar,
	getDesktopSecondarySidebarSnapshot,
	resetDesktopSecondarySidebar,
	showAgentsSidebar,
	subscribeDesktopSecondarySidebar,
} from "./secondarySidebar";
import {
	ShellularFileIconSprite,
	TREE_ICON_THEME_STYLE,
} from "./ShellularFileIcon";
import SidebarResizeHandle from "./SidebarResizeHandle";
import SurfaceRenderer from "./SurfaceRenderer";
import {
	canCloseWorkbenchSurfaces,
	canExecuteWorkbenchSurfaceCommand,
	commitCloseWorkbenchSurfaces,
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
import WorkbenchLayout from "./WorkbenchLayout";
import WorkbenchWelcome from "./WorkbenchWelcome";
import {
	formatWorkbenchDocumentTitle,
	resolveWorkbenchContextTitle,
} from "./windowTitle";

const SIDEBAR_WIDTH_KEY = "shellular:desktop-sidebar-width";
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const SECONDARY_SIDEBAR_WIDTH_KEY = "shellular:desktop-secondary-sidebar-width";
const SECONDARY_SIDEBAR_MIN = 240;
const SECONDARY_SIDEBAR_MAX = 480;
const SECONDARY_SIDEBAR_DEFAULT = 320;
const MIN_INLINE_WORKBENCH_WIDTH = 480;

function secondarySidebarWidthKey(hostId: string) {
	return `${SECONDARY_SIDEBAR_WIDTH_KEY}:v1:${hostId}`;
}

function readSecondarySidebarWidth(hostId: string) {
	const saved = Number(localStorage.getItem(secondarySidebarWidthKey(hostId)));
	return saved >= SECONDARY_SIDEBAR_MIN && saved <= SECONDARY_SIDEBAR_MAX
		? saved
		: SECONDARY_SIDEBAR_DEFAULT;
}

type PrimaryActivity = "home" | "remote" | "projects" | "git";

const ACTIVITIES: Array<{
	id: PrimaryActivity;
	label: string;
	icon: string;
}> = [
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
	const secondarySidebar = useSyncExternalStore(
		subscribeDesktopSecondarySidebar,
		getDesktopSecondarySidebarSnapshot,
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
	const [projectsVisited, setProjectsVisited] = useState(false);
	const [showNewChat, setShowNewChat] = useState(false);
	const [newChatProjectPath, setNewChatProjectPath] = useState<string>();
	const [gitFocusRequest, setGitFocusRequest] = useState<{
		projectPath: string;
		id: number;
	}>();
	const [collapsed, setCollapsed] = useState(false);
	const [compact, setCompact] = useState(() => window.innerWidth < 900);
	const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
	const [width, setWidth] = useState(() => {
		const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
		return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 300;
	});
	const hostId = getHostInfo()?.id ?? "local";
	const [secondarySidebarWidth, setSecondarySidebarWidth] = useState(() =>
		readSecondarySidebarWidth(hostId),
	);
	const secondarySidebarOverlay =
		compact ||
		viewportWidth -
			48 -
			(collapsed ? 0 : width + 8) -
			secondarySidebarWidth -
			8 <
			MIN_INLINE_WORKBENCH_WIDTH;
	const { openProjectPicker } = useProjectPicker();
	const observedRestoreRef = useRef(false);
	const activeTerminalsRef = useRef(activeTerminals);
	activeTerminalsRef.current = activeTerminals;
	const lastFocusedElementRef = useRef<HTMLElement | null>(null);
	const nativeCommandHandlerRef = useRef<(command: DesktopCommand) => void>(
		() => {},
	);
	const [, setFocusRevision] = useState(0);
	const gitWorkspace = useDesktopGitWorkspace();
	const activeSurface = workbench.surfaces.find(
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
			setViewportWidth(window.innerWidth);
			setCompact(media.matches);
			if (media.matches) setCollapsed(true);
		};
		update();
		media.addEventListener("change", update);
		window.addEventListener("resize", update);
		return () => {
			media.removeEventListener("change", update);
			window.removeEventListener("resize", update);
		};
	}, []);

	useEffect(() => {
		setSecondarySidebarWidth(readSecondarySidebarWidth(hostId));
		resetDesktopSecondarySidebar();
	}, [hostId]);

	useEffect(() => {
		if (compact && secondarySidebar.open) setCollapsed(true);
	}, [compact, secondarySidebar.open]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !collapsed) setCollapsed(true);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [collapsed]);

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
		if (getDesktopSecondarySidebarSnapshot().open && window.innerWidth < 900) {
			closeDesktopSecondarySidebar();
		}
		if (next === "projects") setProjectsVisited(true);
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
			const liveTerminal =
				surface.kind === "terminal" &&
				activeTerminalsRef.current.some(
					(terminal) => terminal.terminalId === surface.terminalId,
				);
			if (
				liveTerminal &&
				!(await dialog.confirm(
					"Close this tab and kill the terminal process?",
					"Close Terminal",
				))
			) {
				return false;
			}
			if (
				!(await canCloseWorkbenchSurfaces([surface.id], {
					reason: "tab",
					destructiveConfirmed: liveTerminal,
				}))
			) {
				return false;
			}
			if (liveTerminal && surface.kind === "terminal") {
				closeTerminal(surface.terminalId);
			}
			return commitCloseWorkbenchSurfaces([surface.id]);
		},
		[closeTerminal],
	);
	const closeSurfaces = useCallback(
		async (
			surfaces: WorkbenchSurface[],
			reason: "pane" | "tile-group" | "bulk" = "bulk",
		) => {
			const capturedIds = [...new Set(surfaces.map((surface) => surface.id))];
			if (capturedIds.length === 0) return true;
			const current = getWorkbenchSnapshot();
			const captured = capturedIds
				.map((id) => current.surfaces.find((surface) => surface.id === id))
				.filter((surface): surface is WorkbenchSurface => Boolean(surface));
			const warningIds = (state = current) =>
				new Set(
					captured
						.filter((surface) => {
							const latest = state.surfaces.find(
								(item) => item.id === surface.id,
							);
							const pinned = findWorkbenchTab(state.root, surface.id)?.tab
								.pinned;
							const liveTerminal =
								latest?.kind === "terminal" &&
								activeTerminalsRef.current.some(
									(terminal) => terminal.terminalId === latest.terminalId,
								);
							return Boolean(latest?.dirty || pinned || liveTerminal);
						})
						.map((surface) => surface.id),
				);
			const dirtyCount = captured.filter((surface) => surface.dirty).length;
			const terminalCount = captured.filter(
				(surface) =>
					surface.kind === "terminal" &&
					activeTerminalsRef.current.some(
						(terminal) => terminal.terminalId === surface.terminalId,
					),
			).length;
			const pinnedCount = captured.filter(
				(surface) => findWorkbenchTab(current.root, surface.id)?.tab.pinned,
			).length;
			const paneCount = new Set(
				captured
					.map(
						(surface) => findWorkbenchTab(current.root, surface.id)?.group.id,
					)
					.filter(Boolean),
			).size;
			const structural = reason === "pane" || reason === "tile-group";
			const needsConfirmation =
				structural || dirtyCount > 0 || terminalCount > 0 || pinnedCount > 0;
			const initialWarnings = warningIds();
			if (needsConfirmation) {
				const confirmed = await dialog.confirm(
					`Close ${captured.length} ${captured.length === 1 ? "tab" : "tabs"} across ${paneCount} ${paneCount === 1 ? "pane" : "panes"}?\n\nUnsaved: ${dirtyCount} · Live terminals: ${terminalCount} · Pinned: ${pinnedCount}`,
					reason === "tile-group"
						? "Close Tile Group"
						: reason === "pane"
							? "Close Pane"
							: "Close Tabs",
				);
				if (!confirmed) return false;
			}
			if (
				!(await canCloseWorkbenchSurfaces(capturedIds, {
					reason,
					destructiveConfirmed: needsConfirmation,
				}))
			) {
				return false;
			}
			const latestWarnings = warningIds(getWorkbenchSnapshot());
			const newlyDestructive = [...latestWarnings].some(
				(id) => !initialWarnings.has(id),
			);
			if (
				newlyDestructive &&
				!(await dialog.confirm(
					"One or more tabs became destructive while confirmation was open. Review and close the captured tabs?",
					"Tabs Changed",
				))
			) {
				return false;
			}
			for (const surface of captured) {
				if (
					surface.kind === "terminal" &&
					activeTerminalsRef.current.some(
						(terminal) => terminal.terminalId === surface.terminalId,
					)
				) {
					closeTerminal(surface.terminalId);
				}
			}
			return commitCloseWorkbenchSurfaces(capturedIds);
		},
		[closeTerminal],
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
					const surface = snapshot.surfaces.find(
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
	const persistSecondarySidebarWidth = useCallback(
		(nextWidth: number) => {
			localStorage.setItem(
				secondarySidebarWidthKey(hostId),
				String(nextWidth),
			);
		},
		[hostId],
	);

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
						<DesktopProfileMenu
							onOpen={(page) => {
								if (page === "agents") showAgentsSidebar();
								else openUtility(page);
							}}
						/>
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
							{projectsVisited && (
								<div
									className="h-full min-h-0"
									hidden={activity !== "projects"}
									inert={activity !== "projects"}
									aria-hidden={activity !== "projects"}
								>
									<ProjectSidebar gitStates={gitWorkspace.states} />
								</div>
							)}
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
					<WorkbenchLayout
						snapshot={workbench}
						compact={compact}
						surfaceTitle={(surface) =>
							surfaceTitle(surface, terminalNames, terminalProcesses)
						}
						renderSurface={(surface) => <SurfaceRenderer surface={surface} />}
						renderWelcome={() => (
							<WorkbenchWelcome
								projects={projects}
								agents={agents}
								onNewTerminal={newTerminal}
								onNewChat={() => requestNewChat()}
								onOpenProject={() => {
									openProjectPicker();
									showActivity("projects");
								}}
								onOpenSettings={() => openUtility("settings")}
							/>
						)}
						onCloseSurface={closeSurface}
						onCloseSurfaces={closeSurfaces}
					/>
				</main>
				<DesktopSecondarySidebar
					width={secondarySidebarWidth}
					overlay={secondarySidebarOverlay}
					onResize={setSecondarySidebarWidth}
					onResizeEnd={persistSecondarySidebarWidth}
				/>
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
