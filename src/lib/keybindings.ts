import file from "bridge/file";
import appConfig from "lib/appConfig";
import {
	DESKTOP_COMMAND_IDS,
	type DesktopKeyboardCommand,
	type DesktopShortcutPlatform,
	type KeybindingOverrides,
	normalizeShortcutBinding,
	type ResolvedKeybindings,
	resolveKeybindings,
	type ShortcutBinding,
} from "workbench/desktopShortcuts";

const KEYBINDINGS_PATH = `${appConfig.DATA_DIR}/keybindings.json`;
const KEYBINDINGS_VERSION = 1;

export interface KeybindingsFile {
	version: 1;
	overrides: KeybindingOverrides;
}

export interface KeybindingsSnapshot {
	initialized: boolean;
	revision: number;
	overrides: KeybindingOverrides;
}

const EMPTY_SNAPSHOT: KeybindingsSnapshot = {
	initialized: false,
	revision: 0,
	overrides: {},
};

let snapshot = EMPTY_SNAPSHOT;
let initialization: Promise<KeybindingsSnapshot> | null = null;
let writeTail: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

export function getKeybindingsSnapshot() {
	return snapshot;
}

export function subscribeKeybindings(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export async function initializeKeybindings() {
	if (snapshot.initialized) return snapshot;
	if (initialization) return initialization;
	initialization = readKeybindings()
		.then((overrides) => {
			emit(overrides);
			return snapshot;
		})
		.finally(() => {
			initialization = null;
		});
	return initialization;
}

export function resolvedKeybindings(
	platform: DesktopShortcutPlatform,
): ResolvedKeybindings {
	return resolveKeybindings(platform, snapshot.overrides);
}

export async function setCommandKeybindings(
	platform: DesktopShortcutPlatform,
	command: DesktopKeyboardCommand,
	bindings: ShortcutBinding[],
) {
	return updateKeybindings((overrides) => ({
		...overrides,
		[platform]: {
			...overrides[platform],
			[command]: normalizeBindings(bindings),
		},
	}));
}

export async function updateCommandKeybindings(
	platform: DesktopShortcutPlatform,
	updates: Partial<Record<DesktopKeyboardCommand, ShortcutBinding[]>>,
) {
	return updateKeybindings((overrides) => ({
		...overrides,
		[platform]: {
			...overrides[platform],
			...Object.fromEntries(
				Object.entries(updates).map(([command, bindings]) => [
					command,
					normalizeBindings(bindings ?? []),
				]),
			),
		},
	}));
}

export async function applyKeybindingChanges(
	platform: DesktopShortcutPlatform,
	changes: {
		set?: Partial<Record<DesktopKeyboardCommand, ShortcutBinding[]>>;
		reset?: DesktopKeyboardCommand[];
	},
) {
	return updateKeybindings((overrides) => {
		const platformOverrides = { ...overrides[platform] };
		for (const command of changes.reset ?? [])
			delete platformOverrides[command];
		for (const [command, bindings] of Object.entries(changes.set ?? {})) {
			platformOverrides[command as DesktopKeyboardCommand] = normalizeBindings(
				bindings ?? [],
			);
		}
		return { ...overrides, [platform]: platformOverrides };
	});
}

export async function resetCommandKeybindings(
	platform: DesktopShortcutPlatform,
	command: DesktopKeyboardCommand,
) {
	return updateKeybindings((overrides) => {
		const platformOverrides = { ...overrides[platform] };
		delete platformOverrides[command];
		return {
			...overrides,
			[platform]: platformOverrides,
		};
	});
}

export async function resetPlatformKeybindings(
	platform: DesktopShortcutPlatform,
) {
	return updateKeybindings((overrides) => ({
		...overrides,
		[platform]: {},
	}));
}

async function updateKeybindings(
	update: (overrides: KeybindingOverrides) => KeybindingOverrides,
) {
	await initializeKeybindings();
	const task = writeTail.then(async () => {
		const next = normalizeOverrides(update(snapshot.overrides));
		const payload: KeybindingsFile = {
			version: KEYBINDINGS_VERSION,
			overrides: next,
		};
		await file.write(KEYBINDINGS_PATH, JSON.stringify(payload));
		emit(next);
	});
	writeTail = task.catch(() => undefined);
	return task;
}

async function readKeybindings(): Promise<KeybindingOverrides> {
	try {
		if (!(await file.exists(KEYBINDINGS_PATH))) return {};
		const text = (await file.read(KEYBINDINGS_PATH, "text")) as string;
		const parsed = JSON.parse(text) as Partial<KeybindingsFile>;
		if (parsed.version !== KEYBINDINGS_VERSION) return {};
		return normalizeOverrides(parsed.overrides);
	} catch {
		return {};
	}
}

function normalizeOverrides(value: unknown): KeybindingOverrides {
	if (!value || typeof value !== "object") return {};
	const input = value as Record<string, unknown>;
	const result: KeybindingOverrides = {};
	for (const platform of ["mac", "windows", "linux"] as const) {
		const rawPlatform = input[platform];
		if (!rawPlatform || typeof rawPlatform !== "object") continue;
		const rawCommands = rawPlatform as Record<string, unknown>;
		const normalized: Partial<
			Record<DesktopKeyboardCommand, ShortcutBinding[]>
		> = {};
		for (const command of DESKTOP_COMMAND_IDS) {
			if (!(command in rawCommands)) continue;
			const rawBindings = rawCommands[command];
			if (!Array.isArray(rawBindings)) continue;
			const bindings = normalizeBindings(rawBindings);
			if (rawBindings.length > 0 && bindings.length === 0) continue;
			normalized[command] = bindings;
		}
		result[platform] = normalized;
	}
	return result;
}

function normalizeBindings(values: unknown[]): ShortcutBinding[] {
	const result: ShortcutBinding[] = [];
	for (const value of values) {
		if (!value || typeof value !== "object") continue;
		const strokes = (value as { strokes?: unknown }).strokes;
		if (!Array.isArray(strokes) || strokes.length < 1 || strokes.length > 2)
			continue;
		const normalized = strokes.map((stroke) => normalizeStroke(stroke));
		if (normalized.some((stroke) => stroke === null)) continue;
		result.push(
			normalizeShortcutBinding({
				strokes: normalized as ShortcutBinding["strokes"],
			}),
		);
	}
	return result;
}

function normalizeStroke(value: unknown) {
	if (!value || typeof value !== "object") return null;
	const stroke = value as { key?: unknown; modifiers?: unknown };
	if (
		typeof stroke.key !== "string" ||
		(!stroke.key.trim() && stroke.key !== " ")
	)
		return null;
	const modifiers = Array.isArray(stroke.modifiers)
		? stroke.modifiers.filter(
				(value): value is "ctrl" | "alt" | "shift" | "meta" =>
					value === "ctrl" ||
					value === "alt" ||
					value === "shift" ||
					value === "meta",
			)
		: [];
	return {
		key: stroke.key === " " ? stroke.key : stroke.key.trim(),
		modifiers: [...new Set(modifiers)],
	};
}

function emit(overrides: KeybindingOverrides) {
	snapshot = {
		initialized: true,
		revision: snapshot.revision + 1,
		overrides,
	};
	for (const listener of listeners) listener();
	window.dispatchEvent(
		new CustomEvent("shellular:keybindings-changed", { detail: snapshot }),
	);
}

export function resetKeybindingsForTests() {
	snapshot = EMPTY_SNAPSHOT;
	initialization = null;
	writeTail = Promise.resolve();
	listeners.clear();
}
