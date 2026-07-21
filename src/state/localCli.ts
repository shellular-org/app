import localCli, {
	type LocalCliCapability,
	type LocalCliSnapshot,
} from "bridge/localCli";
import {
	connectToLocal,
	disconnect,
	getConnectionSnapshot,
} from "./connection";

type Snapshot = {
	capability: LocalCliCapability | null;
	cli: LocalCliSnapshot | null;
	busy: boolean;
	error: string | null;
	phase: "idle" | "preparing" | "connecting" | "ready" | "error";
};
let snapshot: Snapshot = {
	capability: null,
	cli: null,
	busy: false,
	error: null,
	phase: "idle",
};
const listeners = new Set<() => void>();
let _poll: ReturnType<typeof setInterval> | null = null;
let initializing: Promise<void> | null = null;
let pollFailures = 0;

const publish = (patch: Partial<Snapshot>) => {
	snapshot = { ...snapshot, ...patch };
	listeners.forEach((listener) => {
		listener();
	});
};
export const getLocalCliSnapshot = () => snapshot;
export const subscribeLocalCli = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export function initializeLocalCli(): Promise<void> {
	if (initializing) return initializing;
	initializing = (async () => {
		try {
			const capability = await localCli.capability();
			publish({ capability });
			if (!capability.available) return;
			publish({ busy: true, error: null, phase: "preparing" });
			const cli = await localCli.ensureRunning();
			publish({ cli });
			if (getConnectionSnapshot().connectionStatus === "disconnected") {
				publish({ phase: "connecting" });
				await connectToLocal();
			}
			pollFailures = 0;
			publish({ phase: "ready" });
			_poll ??= setInterval(() => void refreshLocalCli(), 2000);
		} catch (error) {
			publish({
				error: error instanceof Error ? error.message : String(error),
				phase: "error",
			});
		} finally {
			publish({ busy: false });
			initializing = null;
		}
	})();
	return initializing;
}

export async function refreshLocalCli(): Promise<void> {
	try {
		publish({ cli: await localCli.status(), error: null, phase: "ready" });
		pollFailures = 0;
	} catch (error) {
		pollFailures += 1;
		if (pollFailures < 2) return;
		publish({
			cli: null,
			error: error instanceof Error ? error.message : String(error),
			phase: "error",
		});
	}
}
export async function connectLocalCli(): Promise<void> {
	publish({ busy: true, error: null, phase: "preparing" });
	try {
		await initializeLocalCli();
		if (!getLocalCliSnapshot().cli)
			throw new Error(
				getLocalCliSnapshot().error ?? "Local access is unavailable.",
			);
		if (getConnectionSnapshot().connectionStatus === "disconnected") {
			publish({ phase: "connecting" });
			await connectToLocal();
		}
		await refreshLocalCli();
	} catch (error) {
		publish({
			error: error instanceof Error ? error.message : String(error),
			phase: "error",
		});
	} finally {
		publish({ busy: false });
	}
}
export async function stopLocalCli(): Promise<void> {
	publish({ busy: true, error: null, phase: "preparing" });
	try {
		disconnect();
		if (snapshot.cli?.lifecycle === "app-owned") await localCli.stop();
		else await localCli.disable();
		if (_poll) clearInterval(_poll);
		_poll = null;
		pollFailures = 0;
		publish({ cli: null, phase: "idle" });
	} catch (error) {
		publish({
			error: error instanceof Error ? error.message : String(error),
			phase: "error",
		});
	} finally {
		publish({ busy: false });
	}
}
export async function setLocalClientApproval(
	clientId: string,
	approved: boolean,
): Promise<void> {
	await localCli.mutateClient({ action: "set-approval", clientId, approved });
	await refreshLocalCli();
}
