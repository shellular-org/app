import { clearTerminalProcessNames } from "state/terminals";
import { z } from "zod";
import * as store from "./store";

const MACHINES_KEY = "connected-machines";
const MAX_MACHINES = 10;

const SavedHostSchema = z.object({
	hostId: z.string(),
	username: z.string().optional(),
	machineId: z.string().optional(),
	encryptionKey: z.string(),
	hostname: z.string(),
	platform: z.string(),
	lastConnected: z.number(),
	alias: z.string().optional(),
	/** Last-seen CLI version reported by this host on connect. */
	cliVersion: z.string().optional(),
});

export type SavedHost = z.infer<typeof SavedHostSchema>;

const SavedHostsRecordSchema = z.record(z.string(), SavedHostSchema);

function sortHosts(hosts: SavedHost[]): SavedHost[] {
	return [...hosts]
		.sort((left, right) => right.lastConnected - left.lastConnected)
		.slice(0, MAX_MACHINES);
}

function toRecord(hosts: SavedHost[]): Record<string, SavedHost> {
	return Object.fromEntries(hosts.map((host) => [host.hostId, host]));
}

export async function getSavedHosts(): Promise<SavedHost[]> {
	const rawData = (await store.get<unknown>(MACHINES_KEY)) ?? {};
	const parsed = SavedHostsRecordSchema.safeParse(rawData);

	if (!parsed.success) {
		console.warn("[hosts] Failed to parse saved hosts:", parsed.error);
		return [];
	}

	const hosts = sortHosts(Object.values(parsed.data));
	return hosts;
}

export async function findHostById(hostId: string): Promise<SavedHost | null> {
	const hosts = await getSavedHosts();
	return hosts.find((host) => host.hostId === hostId) ?? null;
}

export async function upsertSavedHost(data: SavedHost): Promise<void> {
	const hosts = await getSavedHosts();
	const updated = sortHosts([
		data,
		...hosts.filter((host) => host.hostId !== data.hostId),
	]);
	await store.set(MACHINES_KEY, toRecord(updated));
	await getSavedHosts();
}

export async function removeSavedHost(hostId: string): Promise<void> {
	const hosts = await getSavedHosts();
	await store.set(
		MACHINES_KEY,
		toRecord(hosts.filter((host) => host.hostId !== hostId)),
	);
	clearTerminalProcessNames(hostId);
}
