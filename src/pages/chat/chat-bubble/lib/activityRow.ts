import type { AiBackend } from "@shellular/protocol";
import { elideCommand, elidePath } from "./elide";
import type { ToolCallPart } from "./messageParts";

export type ActivityKind =
	| "execute"
	| "read"
	| "change"
	| "search"
	| "fetch"
	| "think"
	| "switch_mode"
	| "other";

export interface ActivityRowModel {
	kind: ActivityKind;
	/** Empty for `other`, where the title alone already carries the meaning. */
	verb: string;
	object?: string;
	/**
	 * The unelided value, for `aria-label`. Elision happens before render, so
	 * without this a screen reader hears the shortened string too.
	 */
	objectFull?: string;
	/** Render the object as monospace payload rather than as a sentence. */
	objectIsMono: boolean;
	running: boolean;
	failed: boolean;
}

const VERBS: Record<ActivityKind, readonly [settled: string, running: string]> =
	{
		execute: ["Ran", "Running"],
		read: ["Read", "Reading"],
		change: ["Changed", "Changing"],
		search: ["Searched", "Searching"],
		fetch: ["Fetched", "Fetching"],
		think: ["Thought", "Thinking"],
		switch_mode: ["Switched mode", "Switching mode"],
		other: ["", ""],
	};

/**
 * Which argument keys name a call, per agent. `description` is Claude Code's
 * own convention rather than an ACP field, so a *named* agent we know nothing
 * about gets the conservative chain instead of inheriting it. A caller that
 * names no backend at all is a different case: every call site in the app has
 * one, and the app's primary agent is Claude Code, so that resolves here.
 */
const OBJECT_KEYS: Record<
	string,
	Partial<Record<ActivityKind, readonly string[]>>
> = {
	"claude-code": {
		execute: ["description", "command", "cmd", "script"],
		read: ["file_path", "filename", "path"],
		change: ["file_path", "filename", "path"],
		search: ["pattern", "query"],
		fetch: ["url"],
	},
};

const FALLBACK_KEYS: Partial<Record<ActivityKind, readonly string[]>> = {
	execute: ["command", "cmd", "script"],
	read: ["path", "file_path", "filename", "target"],
	change: ["path", "file_path", "filename", "target"],
	search: ["query", "pattern", "search", "needle"],
	fetch: ["url", "uri", "href"],
};

const DEFAULT_BACKEND = "claude-code";

function objectKeysFor(
	kind: ActivityKind,
	backend: AiBackend | undefined,
): readonly string[] {
	return (
		OBJECT_KEYS[backend ?? DEFAULT_BACKEND]?.[kind] ?? FALLBACK_KEYS[kind] ?? []
	);
}

/**
 * One row of the work log. The object is deliberately per-kind: a command is
 * identified by the description its caller wrote, a file by its basename, and
 * a search by its query. Falling back to `title` for everything is what makes
 * five consecutive reads render as five identical strings.
 */
export function deriveActivityRow(
	part: ToolCallPart,
	backend?: AiBackend,
): ActivityRowModel {
	const status = part.status?.toLowerCase();
	const running = status === "pending" || status === "in_progress";
	const failed = status === "failed" || status === "fail";
	const kind = classifyActivityKind(part);
	const args = parseArguments(part.arguments);
	const [settledVerb, runningVerb] = VERBS[kind];
	const base = {
		kind,
		verb: running ? runningVerb : settledVerb,
		running,
		failed,
	};

	switch (kind) {
		case "execute": {
			// The description is what the caller meant; the command is only how.
			const match = findEntry(args, objectKeysFor(kind, backend));
			if (match?.key === "description") {
				return { ...base, object: match.value, objectIsMono: false };
			}
			const command = match?.value;
			return {
				...base,
				object: command ? elideCommand(command) : safeTitle(part.title),
				objectFull: command,
				objectIsMono: true,
			};
		}
		case "read":
		case "change": {
			const path =
				readLocationPath(part) ??
				findEntry(args, objectKeysFor(kind, backend))?.value;
			return {
				...base,
				object: path ? elidePath(path) : safeTitle(part.title),
				objectFull: path,
				objectIsMono: true,
			};
		}
		case "search": {
			const query = findEntry(args, objectKeysFor(kind, backend))?.value;
			return {
				...base,
				object: query ?? safeTitle(part.title),
				objectFull: query,
				objectIsMono: true,
			};
		}
		case "fetch": {
			const url = findEntry(args, objectKeysFor(kind, backend))?.value;
			return {
				...base,
				object: readHost(url) ?? safeTitle(part.title),
				objectFull: url,
				objectIsMono: true,
			};
		}
		case "think":
			return { ...base, object: safeTitle(part.title), objectIsMono: false };
		case "switch_mode":
			return {
				...base,
				object: findEntry(args, ["mode"])?.value ?? safeTitle(part.title),
				objectIsMono: false,
			};
		case "other": {
			const mcp = readMcpTitle(part.title);
			if (mcp) {
				return {
					...base,
					verb: mcp.server,
					object: `[${mcp.tool}]`,
					objectIsMono: false,
				};
			}
			return {
				...base,
				object: safeTitle(part.title) ?? humanizeToolName(part.name),
				objectIsMono: false,
			};
		}
	}
	return assertNever(kind);
}

/** A new `ActivityKind` must fail `pnpm typecheck`, not fall through silently. */
function assertNever(kind: never): never {
	throw new Error(`Unhandled activity kind: ${String(kind)}`);
}

const CANONICAL_KINDS = new Set<string>(Object.keys(VERBS));

/**
 * The host writes the ACP kind into `name` (`name: t.kind ?? "tool"`), so a
 * canonical name is already the answer and the title must not be consulted.
 * That order matters: `mcp__owly__playwright__browser_take_screenshot` contains
 * "browser", and scanning it would file an MCP call under `fetch`. The regex
 * fallbacks stay for agents that send a real tool name instead of a kind.
 */
function classifyActivityKind(part: ToolCallPart): ActivityKind {
	const name = part.name?.toLowerCase().trim();
	if (name && CANONICAL_KINDS.has(name)) return name as ActivityKind;
	const value = `${part.name ?? ""} ${part.title ?? ""}`.toLowerCase();
	if (/switch.?mode|change.?mode/.test(value)) return "switch_mode";
	if (/exec|bash|shell|terminal|command|powershell/.test(value))
		return "execute";
	if (/search|grep|ripgrep|glob|find.?file/.test(value)) return "search";
	if (/edit|write|patch|delete|remove|move|rename|create.?file/.test(value)) {
		return "change";
	}
	if (/read|open.?file|view.?file|load.?file/.test(value)) return "read";
	if (/fetch|http|web|browser|url/.test(value)) return "fetch";
	if (/think|reason/.test(value)) return "think";
	return "other";
}

/**
 * `mcp__owly__playwright__browser_take_screenshot` becomes the server as the
 * verb and the tool verbatim in brackets: `Owly [playwright__browser_take_screenshot]`.
 * The tool name is not prettified. It is the string a maintainer greps for, and
 * the VS Code extension uses the same `<Server> [<tool>]` shape.
 */
function readMcpTitle(
	title: string | undefined,
): { server: string; tool: string } | null {
	if (!title?.startsWith("mcp__")) return null;
	const segments = title.slice("mcp__".length).split("__").filter(Boolean);
	const server = segments.shift();
	if (!server || segments.length === 0) return null;
	return {
		server: server.charAt(0).toUpperCase() + server.slice(1),
		tool: segments.join("__"),
	};
}

function parseArguments(value: string | undefined): unknown {
	if (!value) return undefined;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

/**
 * The matched key travels with the value because the caller's next decision
 * depends on it: a `description` is a sentence, everything else is payload.
 */
function findEntry(
	value: unknown,
	keys: readonly string[],
): { key: string; value: string } | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? { key: "", value: trimmed } : undefined;
	}
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	for (const key of keys) {
		const candidate = readString(record[key]);
		if (candidate) return { key, value: candidate };
	}
	for (const candidate of Object.values(record)) {
		if (candidate && typeof candidate === "object") {
			const nested = findEntry(candidate, keys);
			if (nested) return nested;
		}
	}
	return undefined;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A title that is serialised arguments is worse than no title at all. */
function safeTitle(value: string | undefined): string | undefined {
	const title = value?.trim();
	if (!title || title.startsWith("{") || title.startsWith("["))
		return undefined;
	return title.split(/\r?\n/, 1)[0]?.trim() || undefined;
}

function humanizeToolName(value: string | undefined): string {
	if (!value) return "Used tool";
	const segments = value.split(/[.:/]/);
	const leaf = segments[segments.length - 1] ?? value;
	const words = leaf.replace(/[_-]+/g, " ").trim();
	return words ? `${words[0].toUpperCase()}${words.slice(1)}` : "Used tool";
}

function readLocationPath(part: ToolCallPart): string | undefined {
	const locations = (part as { locations?: unknown }).locations;
	if (!Array.isArray(locations)) return undefined;
	for (const location of locations) {
		if (!location || typeof location !== "object") continue;
		const path = (location as Record<string, unknown>).path;
		if (typeof path === "string" && path) return path;
	}
	return undefined;
}

function readHost(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url).host || url;
	} catch {
		return url;
	}
}
