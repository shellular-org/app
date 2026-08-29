import "./desktop.scss";
import browser from "bridge/browser";
import dialog from "bridge/dialog";
import native, { type DesktopCommand } from "bridge/native";
import LocalCliDashboard from "components/LocalCliDashboard";
import ContextMenuHost from "context-menu/ContextMenuHost";
import { textifyEmoji } from "lib/emoji";
import {
	getKeybindingsSnapshot,
	initializeKeybindings,
	subscribeKeybindings,
} from "lib/keybindings";
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
import DesktopMenuBar from "./DesktopMenuBar";
import DesktopProfileMenu from "./DesktopProfileMenu";
import DesktopSecondarySidebar from "./DesktopSecondarySidebar";
import { subscribeDesktopKeyboardCommands } from "./desktopCommands";
import { subscribeDesktopGitFocus } from "./desktopGitNavigation";
import {
	DESKTOP_COMMAND_IDS,
	type DesktopKeyboardCommand,
	type DesktopMenuCommand,
	DesktopShortcutMatcher,
	type DesktopShortcutPlatform,
	desktopCommandAllowsEditable,
	desktopCommandAllowsTerminal,
	desktopCommandEnablement,
	detectDesktopShortcutPlatform,
	resolveKeybindings,
} from "./desktopShortcuts";
import {
	canRunDomEditCommand,
	runDomEditCommand,
	type WorkbenchEditCommand,
} from "./domEditCommands";
import { useDesktopGitWorkspace } from "./gitWorkspace";
import { findWorkbenchTab } from "./layoutTree";
import NewChatDialog from "./NewChatDialog";
import { setWorkbenchOpenHandler } from "./navigation";
import { requestNewChat, subscribeNewChat } from "./newChat";
import { createProjectChild } from "./ProjectExplorerTree";
import ProjectSidebar from "./ProjectSidebar";
import { refreshProjectExplorer } from "./projectTreeWorkspace";
import {
	ShellularFileIconSprite,
	TREE_ICON_THEME_STYLE,
} from "./ShellularFileIcon";
import SidebarResizeHandle from "./SidebarResizeHandle";
import SurfaceRenderer from "./SurfaceRenderer";
import {
	closeDesktopSecondarySidebar,
	getDesktopSecondarySidebarSnapshot,
	resetDesktopSecondarySidebar,
	showAgentsSidebar,
	showProjectFilesSidebar,
	subscribeDesktopSecondarySidebar,
} from "./secondarySidebar";
import {
	activateWorkbenchSurface,
	canCloseWorkbenchSurfaces,
	canExecuteWorkbenchSurfaceCommand,
	commitCloseWorkbenchSurfaces,
	executeWorkbenchSurfaceCommand,
	focusWorkbenchGroup,
	getWorkbenchCommandRevision,
	getWorkbenchSnapshot,
	moveWorkbenchSurface,
	openWorkbenchDialog,
	openWorkbenchSurface,
	pruneWorkbenchTerminals,
	restoreWorkbench,
	saveWorkbenchSurface,
	subscribeWorkbench,
	subscribeWorkbenchCommands,
	type WorkbenchSurfaceCommand,
} from "./store";
import { createEditorSurface, utilityMetadata } from "./surfaces";
import type { UtilityPage, WorkbenchSurface } from "./types";
import WorkbenchLayout from "./WorkbenchLayout";
import WorkbenchWelcome from "./WorkbenchWelcome";
import {
	findContainingProject,
	formatWorkbenchDocumentTitle,
	projectPathForSurface,
	resolveWorkbenchContextTitle,
} from "./windowTitle";
import {
	adjacentPaneId,
	adjacentPaneMoveTarget,
	adjacentTabId,
	focusedPaneTabIds,
	numberedPaneId,
	otherTabIds,
	reorderedTabTarget,
	rightTabIds,
} from "./workbenchNavigation";

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
	{ id: "projects", label: "Projects", icon: "icon-ai-chat" },
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
	const keybindings = useSyncExternalStore(
		subscribeKeybindings,
		getKeybindingsSnapshot,
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
		getXterm,
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
	const [width, setWidth] = useState(() => {
		const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
		return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 300;
	});
	const hostId = getHostInfo()?.id ?? "local";
	const [secondarySidebarWidth, setSecondarySidebarWidth] = useState(() =>
		readSecondarySidebarWidth(hostId),
	);
	const secondarySidebarOverlayBreakpoint =
		48 +
		(collapsed ? 0 : width + 8) +
		secondarySidebarWidth +
		8 +
		MIN_INLINE_WORKBENCH_WIDTH;
	const [secondarySidebarNarrow, setSecondarySidebarNarrow] = useState(
		() => window.innerWidth < secondarySidebarOverlayBreakpoint,
	);
	const secondarySidebarOverlay = compact || secondarySidebarNarrow;
	const { openProjectPicker } = useProjectPicker();
	const observedRestoreRef = useRef(false);
	const activeTerminalsRef = useRef(activeTerminals);
	activeTerminalsRef.current = activeTerminals;
	const lastFocusedElementRef = useRef<HTMLElement | null>(null);
	const lastMainFocusedElementRef = useRef<HTMLElement | null>(null);
	const nativeCommandHandlerRef = useRef<(command: DesktopCommand) => void>(
		() => {},
	);
	const shortcutPlatformRef = useRef(
		process.env.IS_MACOS ? "mac" : detectDesktopShortcutPlatform(),
	);
	const shortcutMatcherRef = useRef(
		new DesktopShortcutMatcher(shortcutPlatformRef.current),
	);
	const terminalHistoryRef = useRef(
		new Map<
			string,
			{ terminalSurfaceId?: string; nonTerminalSurfaceId?: string }
		>(),
	);
	const [, setFocusRevision] = useState(0);
	const gitWorkspace = useDesktopGitWorkspace();
	const activeSurface = workbench.surfaces.find(
		(surface) => surface.id === workbench.activeId,
	);
	const contextualNew =
		activeSurface?.kind === "chat" ? "new-chat" : "new-file";
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
		void initializeKeybindings().catch(console.error);
	}, []);

	useEffect(() => {
		shortcutMatcherRef.current.setOverrides(keybindings.overrides);
	}, [keybindings.overrides]);

	useEffect(() => {
		if (!activeSurface) return;
		const history = terminalHistoryRef.current.get(hostId) ?? {};
		if (activeSurface.kind === "terminal") {
			history.terminalSurfaceId = activeSurface.id;
		} else {
			history.nonTerminalSurfaceId = activeSurface.id;
		}
		terminalHistoryRef.current.set(hostId, history);
	}, [activeSurface, hostId]);

	useEffect(() => {
		if (!process.env.IS_MACOS) return;
		const resolved = resolveKeybindings("mac", keybindings.overrides);
		const shortcuts = Object.fromEntries(
			DESKTOP_COMMAND_IDS.map((commandId) => {
				const value = resolved[commandId][0];
				return [
					commandId,
					value?.strokes.length === 1
						? {
								key: value.strokes[0].key,
								modifiers: value.strokes[0].modifiers ?? [],
							}
						: null,
				];
			}),
		);
		void native
			.setDesktopShortcutContext({ contextualNew, shortcuts })
			.catch(console.error);
	}, [contextualNew, keybindings.overrides]);

	useEffect(() => {
		const updateFocus = (event: FocusEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			shortcutMatcherRef.current.reset();
			if (target.closest(".desktop-workbench-titlebar")) return;
			lastFocusedElementRef.current = target;
			if (target.closest(".workbench-main")) {
				lastMainFocusedElementRef.current = target;
			}
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
		return () => {
			media.removeEventListener("change", update);
		};
	}, []);

	useEffect(() => {
		const media = window.matchMedia(
			`(max-width: ${Math.max(0, secondarySidebarOverlayBreakpoint - 0.02)}px)`,
		);
		const update = () => setSecondarySidebarNarrow(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, [secondarySidebarOverlayBreakpoint]);

	useEffect(() => {
		setSecondarySidebarWidth(readSecondarySidebarWidth(hostId));
		resetDesktopSecondarySidebar();
	}, [hostId]);

	useEffect(() => {
		if (compact && secondarySidebar.open) setCollapsed(true);
	}, [compact, secondarySidebar.open]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === "Escape" &&
				!collapsed &&
				!shortcutMatcherRef.current.hasPendingChord()
			) {
				setCollapsed(true);
			}
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
		if (!terminalId) return false;
		openWorkbenchSurface({
			kind: "terminal",
			id: `terminal:${terminalId}`,
			title: "Terminal",
			icon: "icon-terminal",
			terminalId,
		});
		window.requestAnimationFrame(() => getXterm?.(terminalId)?.focus());
		return true;
	}, [createTerminal, getXterm]);

	const activeCommandProject = useCallback(() => {
		const snapshot = getWorkbenchSnapshot();
		const surface = snapshot.surfaces.find(
			(candidate) => candidate.id === snapshot.activeId,
		);
		const activePath = surface ? projectPathForSurface(surface) : undefined;
		return activePath ? findContainingProject(activePath, projects) : undefined;
	}, [projects]);

	const resolveCommandProject = useCallback(
		async (message: string) => {
			const activeProject = activeCommandProject();
			if (activeProject) return activeProject;
			if (projects.length === 0) {
				openProjectPicker();
				showActivity("projects");
				return undefined;
			}
			const path = await dialog.select(
				message,
				projects.map((project) => ({
					value: project.path,
					label: `${project.name} — ${project.path}`,
				})),
				"Choose Project",
			);
			return projects.find((project) => project.path === path);
		},
		[activeCommandProject, openProjectPicker, projects, showActivity],
	);

	const createNewFile = useCallback(async () => {
		let project = activeCommandProject();
		let fileName: string | undefined;
		if (!project) {
			if (projects.length === 0) {
				openProjectPicker();
				showActivity("projects");
				return;
			}
			const selection = await dialog.selectProjectFile(
				"Choose a project and enter a filename.",
				projects.map((candidate) => ({
					value: candidate.path,
					label: `${candidate.name} — ${candidate.path}`,
				})),
			);
			if (!selection) return;
			project = projects.find(
				(candidate) => candidate.path === selection.projectPath,
			);
			fileName = selection.fileName;
		}
		if (!project) return;
		const created =
			fileName === undefined
				? await createProjectChild(project.path, "file")
				: await createProjectChild(project.path, "file", undefined, fileName);
		if (!created) return;
		void refreshProjectExplorer(project.path);
		openWorkbenchSurface(
			createEditorSurface({
				id: `editor:${created.path}`,
				filePath: created.path,
			}),
		);
	}, [activeCommandProject, openProjectPicker, projects, showActivity]);

	const focusSidebar = useCallback((selector?: string) => {
		window.requestAnimationFrame(() => {
			const sidebar = document.querySelector<HTMLElement>(".workbench-sidebar");
			const target =
				(selector
					? sidebar?.querySelector<HTMLElement>(selector)
					: undefined) ??
				sidebar?.querySelector<HTMLElement>(
					"input, button:not([disabled]), [tabindex]:not([tabindex='-1'])",
				);
			target?.focus();
		});
	}, []);

	const focusActiveSurface = useCallback(() => {
		const previous = lastMainFocusedElementRef.current;
		const fallback = document.querySelector<HTMLElement>(
			".workbench-main .workbench-pane.is-focused .monaco-editor textarea, .workbench-main .workbench-pane.is-focused .xterm textarea, .workbench-main .workbench-pane.is-focused textarea, .workbench-main .workbench-pane.is-focused input, .workbench-main .workbench-pane.is-focused [role='tab'][aria-selected='true']",
		);
		(previous?.isConnected ? previous : fallback)?.focus();
	}, []);

	const toggleTerminal = useCallback(async () => {
		const snapshot = getWorkbenchSnapshot();
		const current = snapshot.surfaces.find(
			(surface) => surface.id === snapshot.activeId,
		);
		const history = terminalHistoryRef.current.get(hostId) ?? {};
		if (current?.kind === "terminal") {
			const target =
				snapshot.surfaces.find(
					(surface) =>
						surface.id === history.nonTerminalSurfaceId &&
						surface.kind !== "terminal",
				) ??
				[...snapshot.surfaces]
					.reverse()
					.find((surface) => surface.kind !== "terminal");
			if (!target) {
				getXterm?.(current.terminalId)?.focus();
				return true;
			}
			activateWorkbenchSurface(target.id);
			window.requestAnimationFrame(focusActiveSurface);
			return true;
		}

		if (current) history.nonTerminalSurfaceId = current.id;
		const terminal =
			snapshot.surfaces.find(
				(surface) =>
					surface.id === history.terminalSurfaceId &&
					surface.kind === "terminal" &&
					activeTerminalsRef.current.some(
						(item) => item.terminalId === surface.terminalId,
					),
			) ??
			[...snapshot.surfaces]
				.reverse()
				.find(
					(surface) =>
						surface.kind === "terminal" &&
						activeTerminalsRef.current.some(
							(item) => item.terminalId === surface.terminalId,
						),
				);
		if (!terminal || terminal.kind !== "terminal") return newTerminal();
		history.terminalSurfaceId = terminal.id;
		terminalHistoryRef.current.set(hostId, history);
		activateWorkbenchSurface(terminal.id);
		window.requestAnimationFrame(() =>
			getXterm?.(terminal.terminalId)?.focus(),
		);
		return true;
	}, [focusActiveSurface, getXterm, hostId, newTerminal]);

	const showExplorer = useCallback(async () => {
		const project = await resolveCommandProject(
			"Choose the project whose files you want to browse.",
		);
		if (!project) return;
		showProjectFilesSidebar(project.path, project.name);
	}, [resolveCommandProject]);

	const showSourceControl = useCallback(() => {
		showActivity("git");
		focusSidebar("textarea, input, button:not([disabled])");
	}, [focusSidebar, showActivity]);

	const searchProject = useCallback(async () => {
		const project = await resolveCommandProject(
			"Choose the project to search.",
		);
		if (!project) return;
		showProjectFilesSidebar(project.path, project.name, { search: true });
	}, [resolveCommandProject]);

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

	const canRunDesktopCommand = useCallback(
		(command: DesktopKeyboardCommand) => {
			void commandRevision;
			const snapshot = getWorkbenchSnapshot();
			const activeId = snapshot.activeId;
			const editCommands: Partial<
				Record<DesktopKeyboardCommand, WorkbenchEditCommand>
			> = {
				undo: "undo",
				redo: "redo",
				cut: "cut",
				copy: "copy",
				paste: "paste",
				"select-all": "select-all",
			};
			const editCommand = editCommands[command];
			if (editCommand)
				return (
					canExecuteWorkbenchSurfaceCommand(activeId, editCommand) ||
					canRunDomEditCommand(editCommand, lastFocusedElementRef.current)
				);
			switch (desktopCommandEnablement(command)) {
				case "always":
					return true;
				case "active-surface":
					return Boolean(activeId);
				case "save":
					return canExecuteWorkbenchSurfaceCommand(activeId, "save");
				case "editable":
					return false;
				case "editor":
					return canExecuteWorkbenchSurfaceCommand(
						activeId,
						command as WorkbenchSurfaceCommand,
					);
				case "pane":
					return Boolean(activeId);
			}
			return false;
		},
		[commandRevision],
	);

	const runDesktopCommand = useCallback(
		async (requestedCommand: DesktopKeyboardCommand) => {
			const snapshot = getWorkbenchSnapshot();
			const active = snapshot.surfaces.find(
				(surface) => surface.id === snapshot.activeId,
			);
			const command: DesktopKeyboardCommand =
				requestedCommand === "contextual-new"
					? active?.kind === "chat"
						? "new-chat"
						: "new-file"
					: requestedCommand;
			if (!canRunDesktopCommand(command)) return false;

			const editCommands: Partial<
				Record<DesktopKeyboardCommand, WorkbenchEditCommand>
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
					return true;
				try {
					await runDomEditCommand(editCommand, lastFocusedElementRef.current);
					return true;
				} catch (error) {
					console.warn(`Desktop ${command} command failed`, error);
					toast(
						`${command[0].toUpperCase()}${command.slice(1)} is unavailable`,
						3000,
					);
					return false;
				}
			}

			if (command.startsWith("editor.")) {
				return executeWorkbenchSurfaceCommand(
					snapshot.activeId,
					command as WorkbenchSurfaceCommand,
				);
			}

			switch (command) {
				case "new-chat": {
					const path = active ? projectPathForSurface(active) : undefined;
					requestNewChat(
						path ? findContainingProject(path, projects)?.path : undefined,
					);
					return true;
				}
				case "new-file":
					await createNewFile();
					return true;
				case "toggle-terminal":
					return toggleTerminal();
				case "new-terminal":
					return newTerminal();
				case "open-file": {
					if (
						process.env.IS_MACOS &&
						getConnectionSnapshot().transport === "local"
					) {
						try {
							for (const path of await native.pickLocalFiles(
								getHostInfo()?.dir,
							)) {
								openWorkbenchSurface(
									createEditorSurface({
										id: `editor:${path}`,
										filePath: path,
									}),
								);
							}
						} catch (error) {
							await dialog.message(
								(error as Error).message,
								"Unable to Open File",
							);
						}
						return true;
					}
					const activePath = active ? projectPathForSurface(active) : undefined;
					openWorkbenchDialog({
						kind: "files",
						id: "files:open-file",
						title: "Open File",
						icon: "icon-folder",
						initialPath:
							(activePath
								? findContainingProject(activePath, projects)?.path
								: undefined) ??
							getHostInfo()?.dir ??
							".",
						mode: "project",
						restorable: false,
					});
					return true;
				}
				case "open-folder":
					openProjectPicker();
					showActivity("projects");
					return true;
				case "save":
					return saveWorkbenchSurface(snapshot.activeId);
				case "close-tab": {
					return active ? closeSurface(active) : false;
				}
				case "toggle-sidebar":
					setCollapsed((value) => !value);
					return true;
				case "show-explorer":
					await showExplorer();
					return true;
				case "project-search":
					await searchProject();
					return true;
				case "show-source-control":
					showSourceControl();
					return true;
				case "ports":
					openUtility("ports");
					return true;
				case "system-monitor":
					openUtility("system-monitor");
					return true;
				case "settings":
					openUtility("settings");
					return true;
				case "open-keyboard-shortcuts":
					openUtility("settings", "keybindings");
					return true;
				case "next-tab":
				case "previous-tab": {
					const target = adjacentTabId(
						snapshot,
						command === "next-tab" ? 1 : -1,
					);
					if (!target) return false;
					activateWorkbenchSurface(target);
					window.requestAnimationFrame(focusActiveSurface);
					return true;
				}
				case "focus-pane-1":
				case "focus-pane-2":
				case "focus-pane-3":
				case "focus-pane-4":
				case "focus-pane-5":
				case "focus-pane-6":
				case "focus-pane-7":
				case "focus-pane-8":
				case "focus-pane-9": {
					const number = Number(command.slice(-1));
					const groupId = numberedPaneId(snapshot.root, number);
					if (!groupId) return false;
					focusWorkbenchGroup(groupId);
					window.requestAnimationFrame(focusActiveSurface);
					return true;
				}
				case "focus-pane-left":
				case "focus-pane-right":
				case "focus-pane-up":
				case "focus-pane-down": {
					const groupId = adjacentPaneId(
						snapshot.root,
						snapshot.focusedGroupId,
						command.replace("focus-pane-", "") as
							| "left"
							| "right"
							| "up"
							| "down",
					);
					if (!groupId) return false;
					focusWorkbenchGroup(groupId);
					window.requestAnimationFrame(focusActiveSurface);
					return true;
				}
				case "move-tab-left":
				case "move-tab-right": {
					const target = reorderedTabTarget(
						snapshot,
						command === "move-tab-right" ? 1 : -1,
					);
					return target
						? moveWorkbenchSurface(
								target.surfaceId,
								target.groupId,
								target.index,
							)
						: false;
				}
				case "move-tab-previous-pane":
				case "move-tab-next-pane": {
					const target = adjacentPaneMoveTarget(
						snapshot,
						command === "move-tab-next-pane" ? 1 : -1,
					);
					return target
						? moveWorkbenchSurface(target.surfaceId, target.groupId)
						: false;
				}
				case "close-pane":
				case "close-other-tabs":
				case "close-tabs-right":
				case "close-all-tabs": {
					const ids =
						command === "close-pane"
							? focusedPaneTabIds(snapshot)
							: command === "close-other-tabs"
								? otherTabIds(snapshot)
								: command === "close-tabs-right"
									? rightTabIds(snapshot)
									: snapshot.surfaces.map((surface) => surface.id);
					if (!ids.length) return false;
					const surfaces = ids
						.map((id) => snapshot.surfaces.find((surface) => surface.id === id))
						.filter((surface): surface is WorkbenchSurface => Boolean(surface));
					return closeSurfaces(
						surfaces,
						command === "close-pane" ? "pane" : "bulk",
					);
				}
				case "help":
					await openBrowserSurface(
						"https://shellular.dev/docs",
						"Shellular Help",
					);
					return true;
				case "reach-out":
					openUtility("reach-out");
					return true;
				case "about":
					openUtility("about");
					return true;
				case "undo":
				case "redo":
				case "cut":
				case "copy":
				case "paste":
				case "select-all":
				case "editor.definition":
				case "editor.peekDefinition":
				case "editor.references":
				case "editor.renameSymbol":
				case "editor.formatDocument":
					return false;
			}
		},
		[
			canRunDesktopCommand,
			closeSurface,
			closeSurfaces,
			createNewFile,
			focusActiveSurface,
			newTerminal,
			openProjectPicker,
			projects,
			searchProject,
			showActivity,
			showExplorer,
			showSourceControl,
			toggleTerminal,
		],
	);

	const isDesktopMenuCommandEnabled = useCallback(
		(command: DesktopMenuCommand) => canRunDesktopCommand(command),
		[canRunDesktopCommand],
	);
	const persistSidebarWidth = useCallback((nextWidth: number) => {
		localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
	}, []);
	const persistSecondarySidebarWidth = useCallback(
		(nextWidth: number) => {
			localStorage.setItem(secondarySidebarWidthKey(hostId), String(nextWidth));
		},
		[hostId],
	);

	nativeCommandHandlerRef.current = (command) => {
		void runDesktopCommand(command);
	};

	useEffect(() => {
		if (!process.env.IS_DESKTOP_UI) return;
		return native.setDesktopCommandHandler((command) =>
			nativeCommandHandlerRef.current(command),
		);
	}, []);

	const runDesktopKeyboardCommand = useCallback(
		(command: DesktopKeyboardCommand) => {
			if (!canRunDesktopCommand(command)) return false;
			void runDesktopCommand(command);
			return true;
		},
		[canRunDesktopCommand, runDesktopCommand],
	);

	useEffect(() => {
		if (!process.env.IS_DESKTOP_UI) return;
		const matcher = shortcutMatcherRef.current;
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				event.isComposing ||
				event.repeat ||
				isDesktopShortcutUiBlocked()
			) {
				matcher.reset();
				return;
			}
			const target = event.target instanceof HTMLElement ? event.target : null;
			const terminalTarget = Boolean(target?.closest(".xterm"));
			const editableTarget =
				!terminalTarget &&
				isEditableShortcutTarget(target) &&
				!target?.closest(".monaco-editor");
			if (
				editableTarget &&
				isNativeEditablePasteShortcut(event, shortcutPlatformRef.current)
			) {
				matcher.reset();
				return;
			}
			const snapshot = getWorkbenchSnapshot();
			const active = snapshot.surfaces.find(
				(surface) => surface.id === snapshot.activeId,
			);
			const accepts = (command: DesktopKeyboardCommand) => {
				if (terminalTarget && !desktopCommandAllowsTerminal(command))
					return false;
				if (
					editableTarget &&
					!desktopCommandAllowsEditable(command) &&
					!(command === "contextual-new" && active?.kind === "chat")
				)
					return false;
				return canRunDesktopCommand(command);
			};
			const result = matcher.handle(event, accepts);
			if (result.type === "none") return;
			if (result.type === "pending") {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			if (!runDesktopKeyboardCommand(result.command)) return;
			event.preventDefault();
			event.stopPropagation();
		};
		const reset = () => matcher.reset();
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("blur", reset);
		window.addEventListener("compositionstart", reset);
		window.addEventListener("pointerdown", reset, true);
		window.addEventListener("contextmenu", reset, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("blur", reset);
			window.removeEventListener("compositionstart", reset);
			window.removeEventListener("pointerdown", reset, true);
			window.removeEventListener("contextmenu", reset, true);
			matcher.reset();
		};
	}, [canRunDesktopCommand, runDesktopKeyboardCommand]);

	useEffect(
		() => subscribeDesktopKeyboardCommands(runDesktopKeyboardCommand),
		[runDesktopKeyboardCommand],
	);

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
									onCommand={runDesktopCommand}
									isCommandEnabled={isDesktopMenuCommandEnabled}
									contextualNew={contextualNew}
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
						data-workbench-activity={activity}
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
									<ProjectSidebar />
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
						onNewTerminal={() => void newTerminal()}
						onOpenFile={() => void runDesktopCommand("open-file")}
						onNewChat={() => requestNewChat()}
						onCloseSurface={closeSurface}
						onCloseSurfaces={closeSurfaces}
					/>
				</main>
				<DesktopSecondarySidebar
					width={secondarySidebarWidth}
					overlay={secondarySidebarOverlay}
					gitStates={gitWorkspace.states}
					onRefreshGit={gitWorkspace.refresh}
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

function openUtility(page: UtilityPage, initialSettingsTab?: "keybindings") {
	openWorkbenchSurface({
		kind: "utility",
		id: `utility:${page}`,
		page,
		initialSettingsTab,
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

function isDesktopShortcutUiBlocked() {
	return Boolean(
		document.querySelector(
			"[aria-modal='true'], .app-dialog-root, [role='menu'], [data-keybinding-capture='true']",
		),
	);
}

function isEditableShortcutTarget(target: HTMLElement | null) {
	if (!target) return false;
	return Boolean(
		target.closest(
			"input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
		),
	);
}

function isNativeEditablePasteShortcut(
	event: KeyboardEvent,
	platform: DesktopShortcutPlatform,
) {
	const primaryModifier = platform === "mac" ? event.metaKey : event.ctrlKey;
	const otherPrimaryModifier =
		platform === "mac" ? event.ctrlKey : event.metaKey;
	return (
		primaryModifier &&
		!otherPrimaryModifier &&
		!event.altKey &&
		!event.shiftKey &&
		event.key.toLowerCase() === "v"
	);
}
