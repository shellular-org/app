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
	attachToTerminal,
	closeTerminal as closeTerminalFn,
	createTerminal,
	detachAllTerminals,
	fetchTerminalList,
	getTerminalContainer,
	getTerminalsSnapshot,
	getXterm,
	initTerminalListeners,
	isTerminalBusy,
	type ProcessInfo,
	persistActiveTerminalId,
	type RemoteTerminalInfo,
	renameTerminal,
	restoreTerminalProcessNames,
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
		// Helper: restore terminals from the live CLI terminal list.
		const restoreTerminals = async () => {
			persistActiveTerminalId();
			setTerminalsRestoring(true);
			try {
				const liveTerminals = await fetchTerminalList();

				for (const terminal of liveTerminals) {
					await attachToTerminal(terminal.terminalId, terminal.shell);
				}
			} finally {
				setTerminalsRestoring(false);
			}
		};

		// Save terminal state before attempting reconnection
		setOnPreDisconnectCallback(detachAllTerminals);

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
				});
				setSavedHosts(await getSavedHosts());
			} else if (hostInfo) {
				console.warn("[hosts] Skipping save because hostId is missing");
			}
			initTerminalListeners();
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

	useEffect(() => {
		const onPause = () => {
			const snapshot = getConnectionSnapshot();
			setLastConnectedHost(snapshot.hostInfo);
		};
		const onResume = async () => {
			if (!lastConnectedHost) {
				return;
			}

			const device = await findHostById(lastConnectedHost.id);
			if (device && connection.connectionStatus === "disconnected") {
				connect(
					formatConnectionString(device.hostId, device.encryptionKey),
				).catch((err) => {
					dialog.alert("Error", err.message);
				});
			}
		};

		document.addEventListener("pause", onPause);
		document.addEventListener("resume", onResume);

		return () => {
			document.removeEventListener("pause", onPause);
			document.removeEventListener("resume", onResume);
		};
	}, [connect, connection, lastConnectedHost]);

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
