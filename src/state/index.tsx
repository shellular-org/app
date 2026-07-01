import type { GitCommit, GitCommitFile, HostInfo } from "@shellular/protocol";
import dialog from "bridge/dialog";
import {
	formatConnectionString,
	keyToBase64,
	parseConnectionString,
} from "lib/e2ee";
import {
	findHostById,
	getSavedHosts,
	removeSavedHost,
	type SavedHost,
	upsertSavedHost,
} from "lib/machines";
import { getBaseServerUrl } from "lib/settings";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { type AcpAgentInfo, acpListAgents } from "state/acp";
import {
	loadBookmarkedSessions,
	resetBookmarkedSessions,
} from "./bookmarkSessions";
import { loadChatTabs, resetChatTabs } from "./chatTabs";
import {
	type BatteryInfo,
	connectToServer,
	disconnect as disconnectWs,
	getConnectionSnapshot,
	reconnectNow,
	setOnConnectedCallback,
	setOnDisconnectedCallback,
	setOnPreDisconnectCallback,
	subscribeState,
} from "./connection";
import type {
	FileEntry,
	GitCommitFileDiff,
	GitFileStatus,
	GitLogPage,
	ProjectFileSearchEntry,
	ProjectFileSearchResult,
} from "./filesystem";
import {
	getCommitFileDiff,
	getCommitFiles,
	getGitLog,
	listDir,
	readFile,
	readFileBytes,
	readGitFile,
	searchProjectFiles,
	writeFile,
	writeFileBinary,
} from "./filesystem";
import {
	addProject,
	enrichProjectsWithGitInfo,
	loadProjects,
	type Project,
	type ProjectInfo,
	removeProject,
} from "./projects";
import {
	closeTerminal as closeTerminalFn,
	createTerminal,
	detachAllTerminals,
	detachTerminalListeners,
	fetchTerminalList,
	getTerminalContainer,
	getTerminalsSnapshot,
	getXterm,
	isTerminalBusy,
	type ProcessInfo,
	persistActiveTerminalId,
	type RemoteTerminalInfo,
	renameTerminal,
	restoreTerminalProcessNames,
	restoreTerminalSessions,
	setActiveTerminalId,
	subscribeTerminals,
} from "./terminals";

// ─── Context ──────────────────────────────────────────────────
interface ShellularContextValue {
	// Connection
	serverUrl: string;
	sessionToken: string;
	connectionStatus:
		| "disconnected"
		| "connecting"
		| "connected"
		| "reconnecting";
	hostDir?: string;
	batteryInfo: BatteryInfo | null;
	agents: Record<string, AcpAgentInfo>;
	loadAgents: () => Promise<void>;
	loadingAgents: boolean;

	connect: (token: string) => Promise<void>;
	disconnect: () => void;
	switchDevice: (token: string) => Promise<void>;
	isSwitching: boolean;

	// Terminals
	activeTerminals: RemoteTerminalInfo[];
	activeTerminalId: string | null;
	terminalNames: Record<string, string>;
	terminalProcesses: Record<string, ProcessInfo | null>;
	createTerminal: (options?: { cwd?: string }) => Promise<string | null>;
	closeTerminal: (id: string) => void;
	setActiveTerminalId: (id: string | null) => void;
	getTerminalContainer: (id: string) => HTMLDivElement | null;
	getXterm: (id: string) => import("@xterm/xterm").Terminal | null;
	isTerminalBusy: (id: string) => boolean;
	renameTerminal: (id: string, name: string) => void;
	terminalsRestoring: boolean;

	// Filesystem
	listDir: (path: string, showHidden?: boolean) => Promise<FileEntry[]>;
	searchProjectFiles: (
		path: string,
		query: string,
		options?: {
			limit?: number;
			selectedPath?: string;
			includeHistory?: boolean;
			refresh?: boolean;
		},
	) => Promise<ProjectFileSearchResult>;
	readFile: (path: string) => Promise<string>;
	readFileBytes: (path: string) => Promise<Uint8Array>;
	readGitFile: (path: string) => Promise<string>;
	getGitLog: (
		path: string,
		options?: { skip?: number; limit?: number },
	) => Promise<GitLogPage>;
	getCommitFiles: (path: string, hash: string) => Promise<GitCommitFile[]>;
	getCommitFileDiff: (
		path: string,
		hash: string,
		file: string,
	) => Promise<GitCommitFileDiff>;
	writeFile: (path: string, content: string) => Promise<void>;
	writeFileBinary: (path: string, base64Content: string) => Promise<void>;

	// Projects
	projects: ProjectInfo[];
	loadingProjects: boolean;
	addProject: (path: string) => Promise<void>;
	removeProject: (path: string) => Promise<void>;

	// Saved hosts
	savedHosts: SavedHost[];
	removeSavedHost: (hostId: string) => void;
}

const ShellularContext = createContext<ShellularContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────
export function ShellularProvider({ children }: { children: ReactNode }) {
	const connection = useSyncExternalStore(
		subscribeState,
		getConnectionSnapshot,
	);
	const terminals = useSyncExternalStore(
		subscribeTerminals,
		getTerminalsSnapshot,
	);

	const [agents, setAgents] = useState<Record<string, AcpAgentInfo>>({});
	const [loadingAgents, setLoadingAgents] = useState(false);

	const [savedHosts, setSavedHosts] = useState<SavedHost[]>([]);
	const [projects, setProjects] = useState<ProjectInfo[]>([]);
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [isSwitching, setIsSwitching] = useState(false);
	const [terminalsRestoring, setTerminalsRestoring] = useState(false);
	const [lastConnectedHost, setLastConnectedHost] = useState<HostInfo | null>(
		null,
	);
	const loadedProjectsForRef = useRef<string>("");

	// Load saved hosts on mount.
	useEffect(() => {
		getSavedHosts().then(setSavedHosts).catch(console.error);
	}, []);

	const handleRemoveSavedHost = useCallback((hostId: string) => {
		removeSavedHost(hostId)
			.then(() => getSavedHosts())
			.then(setSavedHosts)
			.catch(console.error);
	}, []);

	const pendingSavedHostRef = useRef<{
		hostId: string;
		machineId: string;
		encryptionKey: string;
	} | null>(null);

	const connect = useCallback(async (token: string) => {
		const { hostId, encryptionKey } = parseConnectionString(token);
		pendingSavedHostRef.current = {
			hostId,
			machineId: "",
			encryptionKey: keyToBase64(encryptionKey),
		};
		restoreTerminalProcessNames(hostId);
		await connectToServer(await getBaseServerUrl(), hostId, encryptionKey);
	}, []);

	const disconnect = useCallback(() => {
		detachAllTerminals();
		pendingSavedHostRef.current = null;
		disconnectWs();
	}, []);

	// Soft-switch: detach without killing ptys, then connect to new device
	const switchDevice = useCallback(async (token: string) => {
		setIsSwitching(true);
		try {
			detachAllTerminals();
			disconnectWs();
			const { hostId, encryptionKey } = parseConnectionString(token);
			pendingSavedHostRef.current = {
				hostId,
				machineId: "",
				encryptionKey: keyToBase64(encryptionKey),
			};
			await connectToServer(await getBaseServerUrl(), hostId, encryptionKey);
		} finally {
			setIsSwitching(false);
		}
	}, []);

	// Store restore function in ref so event handlers can access it
	const restoreTerminalsRef = useRef<(() => Promise<void>) | null>(null);

	const loadAgents = useCallback(async () => {
		try {
			setLoadingAgents(true);
			const agents = await acpListAgents();

			if (connection.connectionStatus === "connected") {
				const agentsMap: Record<string, AcpAgentInfo> = {};
				for (const agent of agents) {
					agentsMap[agent.id] = agent;
				}
				setAgents(agentsMap);
			}
		} catch (err) {
			console.error("error loading agents", err);
		} finally {
			setLoadingAgents(false);
		}
	}, [connection.connectionStatus]);

	useEffect(() => {
		if (connection.connectionStatus === "disconnected") {
			setAgents({});
			return;
		}
		if (connection.connectionStatus !== "connected") return;

		loadAgents();
	}, [connection.connectionStatus, loadAgents]);

	// Set up callbacks for post-connect and disconnect (once, on mount)
	useEffect(() => {
		// Helper: restore terminals from the live CLI terminal list. Existing
		// terminal tiles stay mounted and are re-synced in place, so reconnects
		// don't blank the screen or flash a loader.
		const restoreTerminals = async () => {
			persistActiveTerminalId();
			setTerminalsRestoring(true);
			try {
				const liveTerminals = await fetchTerminalList();
				await restoreTerminalSessions(liveTerminals);
			} finally {
				setTerminalsRestoring(false);
			}
		};

		// On a transient disconnect only detach the dead listeners — keep the
		// terminal UI mounted/frozen so reconnecting feels seamless. Full
		// teardown happens only on a final disconnect (onDisconnected).
		setOnPreDisconnectCallback(detachTerminalListeners);

		setOnConnectedCallback(async (_token: string) => {
			const { hostInfo } = getConnectionSnapshot();

			if (!hostInfo) {
				return;
			}

			// Load projects for this device
			if (hostInfo.id !== loadedProjectsForRef.current) {
				loadedProjectsForRef.current = hostInfo.id;
				setLoadingProjects(true);
				loadProjects(hostInfo.id)
					.then(async (loaded) => {
						const enriched = await enrichProjectsWithGitInfo(
							loaded,
							hostInfo?.dir,
						);
						setProjects(enriched);
					})
					.catch(console.error)
					.finally(() => setLoadingProjects(false));
				loadBookmarkedSessions(hostInfo.id).catch(console.error);
				loadChatTabs(hostInfo.id).catch(console.error);
			}

			if (pendingSavedHostRef.current) {
				const savedHost = await findHostById(hostInfo.id);
				await upsertSavedHost({
					alias: savedHost?.alias,
					hostId: pendingSavedHostRef.current.hostId,
					machineId: hostInfo.machineId,
					username: hostInfo.username,
					encryptionKey: pendingSavedHostRef.current.encryptionKey,
					hostname: hostInfo.hostname,
					platform: hostInfo.platform,
					lastConnected: Date.now(),
					cliVersion: hostInfo.cliVersion ?? savedHost?.cliVersion,
				});
				setSavedHosts(await getSavedHosts());
			} else if (hostInfo) {
				console.warn("[hosts] Skipping save because hostId is missing");
			}
			await restoreTerminals();
		});

		setOnDisconnectedCallback(() => {
			detachAllTerminals();
			setProjects([]);
			setAgents({});
			resetBookmarkedSessions();
			resetChatTabs();
			loadedProjectsForRef.current = "";
		});

		// Store in ref for event handlers
		restoreTerminalsRef.current = restoreTerminals;
	}, []);

	// Keep the latest connected host / connect fn in refs so the lifecycle
	// listeners below can subscribe once and never re-bind.
	const lastConnectedHostRef = useRef<HostInfo | null>(null);
	lastConnectedHostRef.current = lastConnectedHost;
	const connectRef = useRef(connect);
	connectRef.current = connect;

	useEffect(() => {
		const onPause = () => {
			const snapshot = getConnectionSnapshot();
			if (snapshot.hostInfo) {
				setLastConnectedHost(snapshot.hostInfo);
			}
		};

		// Triggered on app resume and when the network comes back. Phones
		// aggressively kill sockets in the background, often without a close
		// frame, so we proactively re-establish instead of waiting for the slow
		// path.
		const recover = async () => {
			const host = lastConnectedHostRef.current;
			if (!host) return;

			const { connectionStatus } = getConnectionSnapshot();

			// Live or merely stale socket → let the manager decide (it no-ops if
			// the connection is healthy, otherwise reconnects immediately).
			if (
				connectionStatus === "connected" ||
				connectionStatus === "reconnecting"
			) {
				reconnectNow();
				return;
			}

			// Fully disconnected (reconnect budget exhausted or never connected)
			// → start a fresh session from the saved host.
			const device = await findHostById(host.id);
			if (device) {
				connectRef
					.current(formatConnectionString(device.hostId, device.encryptionKey))
					.catch((err) => {
						dialog.alert("Error", err.message);
					});
			}
		};

		document.addEventListener("pause", onPause);
		document.addEventListener("resume", recover);
		window.addEventListener("online", recover);

		return () => {
			document.removeEventListener("pause", onPause);
			document.removeEventListener("resume", recover);
			window.removeEventListener("online", recover);
		};
	}, []);

	const handleAddProject = useCallback(
		async (path: string) => {
			const { hostInfo } = getConnectionSnapshot();
			if (!hostInfo) {
				return;
			}

			const rawProjects: Project[] = projects.map((p) => ({
				path: p.path,
				name: p.name,
				addedAt: p.addedAt,
			}));
			const updated = await addProject(hostInfo.id, path, rawProjects);
			setProjects(await enrichProjectsWithGitInfo(updated, hostInfo?.dir));
		},
		[projects],
	);

	const handleRemoveProject = useCallback(
		async (path: string) => {
			const { hostInfo } = getConnectionSnapshot();
			if (!hostInfo) {
				return;
			}
			const rawProjects: Project[] = projects.map((p) => ({
				path: p.path,
				name: p.name,
				addedAt: p.addedAt,
			}));
			const updated = await removeProject(hostInfo.id, path, rawProjects);
			setProjects(await enrichProjectsWithGitInfo(updated, hostInfo?.dir));
		},
		[projects],
	);

	const value: ShellularContextValue = {
		...connection,
		...terminals,
		hostDir: connection.hostInfo?.dir,
		agents,
		loadingAgents,
		loadAgents,
		connect,
		disconnect,
		switchDevice,
		isSwitching,
		createTerminal,
		closeTerminal: closeTerminalFn,
		setActiveTerminalId,
		getTerminalContainer,
		getXterm,
		isTerminalBusy,
		renameTerminal,
		listDir,
		searchProjectFiles,
		readFile,
		readFileBytes,
		readGitFile,
		getGitLog,
		getCommitFiles,
		getCommitFileDiff,
		writeFile,
		writeFileBinary,
		projects,
		loadingProjects,
		addProject: handleAddProject,
		removeProject: handleRemoveProject,
		savedHosts,
		removeSavedHost: handleRemoveSavedHost,
		terminalsRestoring,
	};

	return (
		<ShellularContext.Provider value={value}>
			{children}
		</ShellularContext.Provider>
	);
}

export function useShellular(): ShellularContextValue {
	const ctx = useContext(ShellularContext);
	if (!ctx)
		throw new Error("useShellular must be used within ShellularProvider");
	return ctx;
}

export type {
	BatteryInfo,
	FileEntry,
	GitCommit,
	GitCommitFile,
	GitCommitFileDiff,
	GitFileStatus,
	GitLogPage,
	ProcessInfo,
	ProjectFileSearchEntry,
	ProjectFileSearchResult,
	ProjectInfo,
	RemoteTerminalInfo,
	SavedHost,
};
