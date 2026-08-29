type StorageWindow = Window & typeof globalThis;

const hasOwn = (value: object, key: PropertyKey) =>
	// biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn is unavailable in legacy mobile WebViews.
	Object.prototype.hasOwnProperty.call(value, key);

function createMemoryStorage(): Storage {
	let values: Record<string, string> = Object.create(null) as Record<
		string,
		string
	>;
	let keys: string[] = [];
	return {
		get length() {
			return keys.length;
		},
		clear() {
			values = Object.create(null) as Record<string, string>;
			keys = [];
		},
		getItem(key) {
			const normalized = String(key);
			return hasOwn(values, normalized) ? values[normalized] : null;
		},
		key(index) {
			return keys[index] ?? null;
		},
		removeItem(key) {
			const normalized = String(key);
			if (!hasOwn(values, normalized)) return;
			delete values[normalized];
			keys = keys.filter((value) => value !== normalized);
		},
		setItem(key, value) {
			const normalized = String(key);
			if (!hasOwn(values, normalized)) keys.push(normalized);
			values[normalized] = String(value);
		},
	};
}

export function installDeveloperToolsStorageFallback(
	target: StorageWindow,
	name: "localStorage" | "sessionStorage",
): void {
	try {
		const storage = target[name];
		if (storage && typeof storage.getItem === "function") return;
	} catch {
		// Access can throw for opaque WKWebView documents.
	}
	try {
		Object.defineProperty(target, name, {
			configurable: true,
			enumerable: true,
			value: createMemoryStorage(),
		});
	} catch {
		// Eruda may still be able to initialize without this storage implementation.
	}
}

export function installDeveloperToolsStorageFallbacks(
	target: StorageWindow = window as StorageWindow,
): void {
	installDeveloperToolsStorageFallback(target, "localStorage");
	installDeveloperToolsStorageFallback(target, "sessionStorage");
}
