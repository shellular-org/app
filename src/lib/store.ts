import file from "bridge/file";
import appConfig from "lib/appConfig";

const STORE_PATH = `${appConfig.DATA_DIR}/app-state.json`;

// In-memory cache to avoid repeated disk reads within a session
let cache: Record<string, unknown> | null = null;

async function load(): Promise<Record<string, unknown>> {
	if (cache !== null) return cache;
	try {
		const exists = await file.exists(STORE_PATH);
		if (!exists) {
			cache = {};
			return cache;
		}
		const text = (await file.read(STORE_PATH, "text")) as string;
		cache = JSON.parse(text) as Record<string, unknown>;
		return cache;
	} catch (err) {
		console.error("[store] Failed to load app state:", err);
		cache = {};
		return cache;
	}
}

async function persist(data: Record<string, unknown>): Promise<void> {
	const json = JSON.stringify(data);
	try {
		await file.write(STORE_PATH, json);
	} catch (err) {
		console.error("[store] Failed to write app state:", err);
		return;
	}
	try {
		await file.read(STORE_PATH, "text");
	} catch (err) {
		console.error("[store] Write verification read failed:", err);
	}
}

export async function get<T>(key: string): Promise<T | null> {
	const data = await load();
	const value = data[key];
	return value === undefined ? null : (value as T);
}

export async function set(key: string, value: unknown): Promise<void> {
	const data = await load();
	data[key] = value;
	await persist(data);
}

export async function remove(key: string): Promise<void> {
	const data = await load();
	if (!(key in data)) return;
	delete data[key];
	await persist(data);
}
