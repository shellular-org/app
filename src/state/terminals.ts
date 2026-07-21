import {
	MsgType,
	type TerminalAttachResultMsg,
	type TerminalClosedMsg,
	type TerminalCreateResultMsg,
	type TerminalListResultMsg,
	type TerminalOutputMsg,
	type TerminalTitleMsg,
} from "@shellular/protocol";
import type { FitAddon } from "@xterm/addon-fit";
import type { WebLinksAddon } from "@xterm/addon-web-links";
import type { ITheme, Terminal } from "@xterm/xterm";
import { observeElementResize } from "lib/elementResize";
import { textifyEmoji } from "lib/emoji";
import {
	type AppSettings,
	DEFAULT_TERMINAL_SETTINGS,
	getFontFamilyStack,
	loadSettings,
	SETTINGS_CHANGED_EVENT,
	type TerminalSettings,
} from "lib/settings";
import { createTerminalResizeThrottle } from "lib/terminalResize";
import themes from "themes";
import {
	getConnectionSnapshot,
	getHostInfo,
	onMessage,
	sendMessage,
	sendRequest,
} from "./connection";
import {
	applyTerminalInputToCommandState,
	createTerminalCommandInputState,
	type TerminalCommandInputState,
} from "./terminalStickyCommands";

export interface RemoteTerminalInfo {
	terminalId: string;
	shell: string;
}

export interface ProcessInfo {
	name: string;
}

// ─── State ────────────────────────────────────────────────────
let _activeTerminals: RemoteTerminalInfo[] = [];
let _activeTerminalId: string | null = null;
let _terminalNames: Record<string, string> = {};
let _terminalProcesses: Record<string, ProcessInfo | null> = {};

type Listener = () => void;
type TerminalsSnapshot = {
	activeTerminals: RemoteTerminalInfo[];
	activeTerminalId: string | null;
	terminalNames: Record<string, string>;
	terminalProcesses: Record<string, ProcessInfo | null>;
};
const terminalListeners = new Set<Listener>();

let _terminalsSnapshot: TerminalsSnapshot = {
	activeTerminals: _activeTerminals,
	activeTerminalId: _activeTerminalId,
	terminalNames: _terminalNames,
	terminalProcesses: _terminalProcesses,
};

function emit() {
	_terminalsSnapshot = {
		activeTerminals: _activeTerminals,
		activeTerminalId: _activeTerminalId,
		terminalNames: _terminalNames,
		terminalProcesses: _terminalProcesses,
	};
	for (const fn of terminalListeners) fn();
}

export function subscribeTerminals(listener: Listener): () => void {
	terminalListeners.add(listener);
	return () => terminalListeners.delete(listener);
}

export function getTerminalsSnapshot() {
	return _terminalsSnapshot;
}

export function setActiveTerminalId(id: string | null) {
	const hostInfo = getHostInfo();
	if (!hostInfo) return;
	if (id) {
		localStorage.setItem(`active_terminal_${hostInfo.id}`, id);
	} else {
		localStorage.removeItem(`active_terminal_${hostInfo.id}`);
	}
	_activeTerminalId = id;
	emit();
}

export function persistActiveTerminalId() {
	if (!_activeTerminalId) {
		const hostInfo = getHostInfo();
		if (!hostInfo) return;
		setActiveTerminalId(localStorage.getItem(`active_terminal_${hostInfo.id}`));
	}
}

export function persistTerminalProcessNames() {
	localStorage.setItem(
		`terminal_processes_${getConnectionSnapshot().sessionToken}`,
		JSON.stringify(_terminalProcesses),
	);
}

export function restoreTerminalProcessNames(hostId: string) {
	const key = `terminal_processes_${hostId}`;

	if (key in localStorage) {
		try {
			_terminalProcesses = JSON.parse(localStorage.getItem(key) ?? "{}");
		} catch {}
	}
}

export function clearTerminalProcessNames(hostId: string) {
	localStorage.removeItem(`terminal_processes_${hostId}`);
}

export function renameTerminal(terminalId: string, name: string) {
	const trimmed = name.trim();
	if (trimmed) {
		_terminalNames = { ..._terminalNames, [terminalId]: trimmed };
	} else {
		const next = { ..._terminalNames };
		delete next[terminalId];
		_terminalNames = next;
	}
	emit();
}

// ─── Modifier state for keyboard toolbar ──────────────────────
interface ModifierState {
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
}

const terminalModifiers = new Map<string, ModifierState>();

export function getModifierState(terminalId: string): ModifierState {
	const existing = terminalModifiers.get(terminalId);
	if (!existing) {
		const newState = { ctrl: false, alt: false, shift: false };
		terminalModifiers.set(terminalId, newState);
		return newState;
	}
	return existing;
}

export function setModifierState(
	terminalId: string,
	modifiers: Partial<ModifierState>,
) {
	const current = getModifierState(terminalId);
	terminalModifiers.set(terminalId, { ...current, ...modifiers });
	emit();
}

export function resetModifiers(terminalId: string) {
	terminalModifiers.set(terminalId, { ctrl: false, alt: false, shift: false });
	emit();
}

// Transform keyboard input based on active modifiers
function transformWithModifiers(
	data: string,
	modifiers: ModifierState,
): string {
	if (!modifiers.ctrl && !modifiers.alt && !modifiers.shift) {
		return data; // No modifiers, return as-is
	}

	// Leave escape sequences and multi-character terminal data alone.
	// Toolbar navigation keys synthesize their own modifier-aware CSI sequences.
	if (data.length !== 1) {
		return data;
	}

	const next = modifiers.shift ? applyShiftToCharacter(data) : data;

	// Get first character code
	const code = next.charCodeAt(0);

	// Apply modifiers to alphabetic characters
	if (code >= 97 && code <= 122) {
		// lowercase a-z
		if (modifiers.ctrl && modifiers.alt) {
			// Ctrl+Alt+key: ESC + Ctrl+key
			return `\x1b${String.fromCharCode(code - 96)}`;
		}
		if (modifiers.ctrl) {
			// Ctrl+key: 0x01 to 0x1A
			return String.fromCharCode(code - 96);
		}
		if (modifiers.alt) {
			// Alt+key: ESC + key
			return `\x1b${next}`;
		}
	} else if (code >= 65 && code <= 90) {
		// uppercase A-Z
		if (modifiers.ctrl && modifiers.alt) {
			return `\x1b${String.fromCharCode(code - 64)}`;
		}
		if (modifiers.ctrl) {
			return String.fromCharCode(code - 64);
		}
		if (modifiers.alt) {
			return `\x1b${next}`;
		}
	} else if (modifiers.alt) {
		// For non-alphabetic keys with Alt, just prepend ESC
		return `\x1b${next}`;
	}

	return next;
}

function applyShiftToCharacter(data: string): string {
	if (data >= "a" && data <= "z") {
		return data.toUpperCase();
	}

	const shiftedSymbols: Record<string, string> = {
		"1": "!",
		"2": "@",
		"3": "#",
		"4": "$",
		"5": "%",
		"6": "^",
		"7": "&",
		"8": "*",
		"9": "(",
		"0": ")",
		"`": "~",
		"-": "_",
		"=": "+",
		"[": "{",
		"]": "}",
		"\\": "|",
		";": ":",
		"'": '"',
		",": "<",
		".": ">",
		"/": "?",
	};

	return shiftedSymbols[data] ?? data;
}

// terminalId → { container HTMLElement, xterm Terminal instance }
interface TerminalEntry {
	container: TerminalHTMLElement;
	terminal: Terminal;
	needsInitialScroll: boolean;
}

type TerminalMarker = NonNullable<ReturnType<Terminal["registerMarker"]>>;

interface StickyCommandRecord {
	command: string;
	marker: TerminalMarker;
	sourceRows: string[];
	visualRowCount: number;
}

interface PendingStickyCommand {
	command?: string;
	attempts: number;
}

interface StickyCommandRuntime {
	inputState: TerminalCommandInputState;
	commands: StickyCommandRecord[];
	pendingCommands: PendingStickyCommand[];
	overlay: HTMLDivElement;
	content: HTMLPreElement;
	refreshQueued: boolean;
}

// Type extensions for HTMLElement custom properties
export interface TerminalHTMLElement extends HTMLDivElement {
	fit?: () => void;
}

const terminalEntries = new Map<string, TerminalEntry>();
const terminalDisposers = new Map<string, Array<() => void>>();
const terminalShells = new Map<string, string>();
const terminalStickyCommands = new Map<string, StickyCommandRuntime>();

let unlistenData: (() => void) | null = null;
let unlistenClosed: (() => void) | null = null;
let unlistenTitle: (() => void) | null = null;

export function getTerminalContainer(
	terminalId: string,
): HTMLDivElement | null {
	return terminalEntries.get(terminalId)?.container ?? null;
}

export function getXterm(terminalId: string): Terminal | null {
	return terminalEntries.get(terminalId)?.terminal ?? null;
}

// ─── Init listeners (called once on connect) ─────────────────
export function initTerminalListeners(): void {
	// Guard: only initialize once per connection
	if (unlistenData && unlistenClosed && unlistenTitle) {
		return;
	}

	// Clear any stale listeners before initializing new ones
	if (unlistenData) {
		unlistenData();
		unlistenData = null;
	}
	if (unlistenClosed) {
		unlistenClosed();
		unlistenClosed = null;
	}
	if (unlistenTitle) {
		unlistenTitle();
		unlistenTitle = null;
	}

	unlistenData = onMessage<TerminalOutputMsg>(MsgType.TERMINAL_DATA, (msg) => {
		const { terminalId, data } = msg.data;

		// Write to xterm and auto-scroll if at bottom
		const entry = terminalEntries.get(terminalId);
		if (entry) {
			const { terminal } = entry;

			// Check if user was at bottom before writing new data
			let wasAtBottom = false;
			try {
				const buffer = terminal.buffer.active;
				const viewportY = buffer.viewportY;
				const baseY = buffer.baseY;
				const cursorY = buffer.cursorY;
				wasAtBottom = viewportY + terminal.rows >= baseY + cursorY;
			} catch {}

			// Write the data (force text-style emoji rendering). xterm applies
			// writes asynchronously, so command markers must be captured only after
			// the echoed command/output has been parsed into the buffer.
			terminal.write(textifyEmoji(data), () => {
				capturePendingStickyCommands(terminalId);
				queueStickyCommandRefresh(terminalId);

				if (wasAtBottom) {
					try {
						terminal.scrollToBottom();
					} catch {}
				}
			});
		}
	});

	unlistenClosed = onMessage<TerminalClosedMsg>(
		MsgType.TERMINAL_CLOSED,
		(msg) => {
			if (!msg.data) return;
			const { terminalId } = msg.data;
			if (!terminalId) return;

			cleanupTerminal(terminalId);
			_activeTerminals = _activeTerminals.filter(
				(t) => t.terminalId !== terminalId,
			);
			if (_activeTerminalId === terminalId) {
				_activeTerminalId = _activeTerminals[0]?.terminalId ?? null;
			}
			emit();
		},
	);

	// ── Terminal title updates (process name from CLI) ──────
	unlistenTitle = onMessage<TerminalTitleMsg>(MsgType.TERMINAL_TITLE, (msg) => {
		if (msg instanceof Event) return;
		const { terminalId, title } = msg.data;
		if (!terminalId) return;

		if (title?.trim()) {
			_terminalProcesses = {
				..._terminalProcesses,
				[terminalId]: { name: textifyEmoji(title.trim()) },
			};
		} else {
			// Clear title when empty
			const processes = { ..._terminalProcesses };
			delete processes[terminalId];
			_terminalProcesses = processes;
		}

		persistTerminalProcessNames();
		emit();
	});
}

export function sendTerminalInput(terminalId: string, data: string): void {
	recordTerminalInput(terminalId, data);
	sendMessage({
		type: MsgType.TERMINAL_DATA,
		data: { terminalId, data },
	});
}

function recordTerminalInput(terminalId: string, data: string): void {
	const runtime = terminalStickyCommands.get(terminalId);
	if (!runtime) return;

	const result = applyTerminalInputToCommandState(runtime.inputState, data);
	if (result.clearHistory) {
		clearStickyCommandHistory(terminalId);
	}
	if (result.commands.length) {
		runtime.pendingCommands.push(
			...result.commands.map((command) => ({ command, attempts: 0 })),
		);
		runtime.pendingCommands = runtime.pendingCommands.slice(-10);
		capturePendingStickyCommands(terminalId);
		queueStickyCommandRefresh(terminalId);
	}
	if (result.captureCurrentLine) {
		const terminal = terminalEntries.get(terminalId)?.terminal;
		const record = terminal ? findVisibleStickyCommandRecord(terminal) : null;
		if (record) {
			addStickyCommandRecord(runtime, record);
		} else {
			runtime.pendingCommands.push({ attempts: 0 });
		}
		queueStickyCommandRefresh(terminalId);
	}
}

function attachStickyCommandHeader(
	terminalId: string,
	container: TerminalHTMLElement,
	xterm: Terminal,
	disposers: Array<() => void>,
): void {
	const overlay = document.createElement("div");
	overlay.className = "terminal-sticky-command";
	overlay.hidden = true;

	const content = document.createElement("pre");
	content.className = "terminal-sticky-command-content";
	overlay.appendChild(content);
	container.appendChild(overlay);

	const runtime: StickyCommandRuntime = {
		inputState: createTerminalCommandInputState(),
		commands: [],
		pendingCommands: [],
		overlay,
		content,
		refreshQueued: false,
	};
	terminalStickyCommands.set(terminalId, runtime);

	const scrollDisposable = xterm.onScroll(() =>
		queueStickyCommandRefresh(terminalId),
	);
	const lineFeedDisposable = xterm.onLineFeed(() => {
		capturePendingStickyCommands(terminalId);
		queueStickyCommandRefresh(terminalId);
	});
	const cursorDisposable = xterm.onCursorMove(() =>
		queueStickyCommandRefresh(terminalId),
	);
	const resizeDisposable = xterm.onResize(() =>
		queueStickyCommandRefresh(terminalId),
	);

	disposers.push(() => {
		scrollDisposable.dispose();
		lineFeedDisposable.dispose();
		cursorDisposable.dispose();
		resizeDisposable.dispose();
		clearStickyCommandRecords(runtime);
		terminalStickyCommands.delete(terminalId);
		overlay.remove();
	});

	queueStickyCommandRefresh(terminalId);
}

function capturePendingStickyCommands(terminalId: string): void {
	const runtime = terminalStickyCommands.get(terminalId);
	const terminal = terminalEntries.get(terminalId)?.terminal;
	if (!runtime || !terminal || runtime.pendingCommands.length === 0) return;

	const pending: PendingStickyCommand[] = [];
	for (const command of runtime.pendingCommands) {
		const record = command.command
			? findStickyCommandRecord(terminal, command.command)
			: findVisibleStickyCommandRecord(terminal);
		if (record) {
			addStickyCommandRecord(runtime, record);
		} else if (command.attempts < 20) {
			pending.push({ ...command, attempts: command.attempts + 1 });
		}
	}
	runtime.pendingCommands = pending;
}

function addStickyCommandRecord(
	runtime: StickyCommandRuntime,
	record: StickyCommandRecord,
): void {
	runtime.commands.push(record);
	const retained = runtime.commands
		.filter((item) => item.marker.line !== -1)
		.slice(-50);
	for (const command of runtime.commands) {
		if (!retained.includes(command)) {
			command.marker.dispose();
		}
	}
	runtime.commands = retained;
}

function findStickyCommandRecord(
	terminal: Terminal,
	command: string,
): StickyCommandRecord | null {
	const buffer = terminal.buffer.active;
	if (buffer.type !== "normal") return null;

	const cursorLine = buffer.baseY + buffer.cursorY;
	const startSearch = Math.max(0, cursorLine - 200);
	const normalizedCommand = normalizeTerminalCommandMatchText(command);
	const seenRanges = new Set<string>();

	for (let lineIndex = cursorLine; lineIndex >= startSearch; lineIndex--) {
		const range = getWrappedRowRange(buffer, lineIndex);
		const rangeKey = `${range.start}:${range.end}`;
		if (seenRanges.has(rangeKey)) continue;
		seenRanges.add(rangeKey);

		const sourceRows = getBufferRows(buffer, range.start, range.end);
		const normalizedRows = normalizeTerminalCommandMatchText(
			sourceRows.join(""),
		);
		if (!normalizedRows.includes(normalizedCommand)) continue;

		const marker = terminal.registerMarker(range.start - cursorLine);
		if (!marker) return null;

		return {
			command,
			marker,
			sourceRows,
			visualRowCount: sourceRows.length,
		};
	}

	return null;
}

function findVisibleStickyCommandRecord(
	terminal: Terminal,
): StickyCommandRecord | null {
	const buffer = terminal.buffer.active;
	if (buffer.type !== "normal") return null;

	const cursorLine = buffer.baseY + buffer.cursorY;
	const startSearch = Math.max(0, cursorLine - 5);
	const seenRanges = new Set<string>();

	for (let lineIndex = cursorLine; lineIndex >= startSearch; lineIndex--) {
		const range = getWrappedRowRange(buffer, lineIndex);
		const rangeKey = `${range.start}:${range.end}`;
		if (seenRanges.has(rangeKey)) continue;
		seenRanges.add(rangeKey);

		const sourceRows = getBufferRows(buffer, range.start, range.end);
		const displayText = sourceRows.join("").trim();
		if (!displayText) continue;

		const marker = terminal.registerMarker(range.start - cursorLine);
		if (!marker) return null;

		return {
			command: displayText,
			marker,
			sourceRows,
			visualRowCount: sourceRows.length,
		};
	}

	return null;
}

function getWrappedRowRange(
	buffer: Terminal["buffer"]["active"],
	lineIndex: number,
): { start: number; end: number } {
	let start = lineIndex;
	while (start > 0 && buffer.getLine(start)?.isWrapped) {
		start--;
	}

	let end = lineIndex;
	while (buffer.getLine(end + 1)?.isWrapped) {
		end++;
	}

	return { start, end };
}

function getBufferRows(
	buffer: Terminal["buffer"]["active"],
	start: number,
	end: number,
): string[] {
	const rows: string[] = [];
	for (let i = start; i <= end; i++) {
		rows.push(buffer.getLine(i)?.translateToString(true) ?? "");
	}
	return rows;
}

function normalizeTerminalCommandMatchText(value: string): string {
	return value.replace(/\s+/g, "");
}

function queueStickyCommandRefresh(terminalId: string): void {
	const runtime = terminalStickyCommands.get(terminalId);
	if (!runtime || runtime.refreshQueued) return;

	runtime.refreshQueued = true;
	queueMicrotask(() => {
		runtime.refreshQueued = false;
		refreshStickyCommandHeader(terminalId);
	});
}

function refreshStickyCommandHeader(terminalId: string): void {
	const runtime = terminalStickyCommands.get(terminalId);
	const terminal = terminalEntries.get(terminalId)?.terminal;
	if (!runtime || !terminal) return;

	const buffer = terminal.buffer.active;
	if (buffer.type !== "normal") {
		hideStickyCommand(runtime);
		return;
	}

	runtime.commands = runtime.commands.filter((command) =>
		isStickyCommandRecordValid(terminal, command),
	);

	const viewportY = buffer.viewportY;
	let stickyCommand: StickyCommandRecord | undefined;
	for (const command of runtime.commands) {
		if (command.marker.line === -1) continue;
		if (viewportY <= command.marker.line + command.visualRowCount - 1) {
			continue;
		}
		if (!stickyCommand || command.marker.line > stickyCommand.marker.line) {
			stickyCommand = command;
		}
	}

	if (!stickyCommand) {
		hideStickyCommand(runtime);
		return;
	}

	renderStickyCommand(runtime, terminal, stickyCommand);
}

function isStickyCommandRecordValid(
	terminal: Terminal,
	command: StickyCommandRecord,
): boolean {
	const markerLine = command.marker.line;
	if (markerLine === -1) return false;

	const buffer = terminal.buffer.active;
	if (buffer.type !== "normal") return false;

	for (let i = 0; i < command.sourceRows.length; i++) {
		const current = buffer.getLine(markerLine + i)?.translateToString(true);
		if (current !== command.sourceRows[i]) return false;
	}

	return true;
}

function renderStickyCommand(
	runtime: StickyCommandRuntime,
	terminal: Terminal,
	command: StickyCommandRecord,
): void {
	const maxRows = Math.max(
		1,
		Math.min(5, Math.floor(terminal.rows * 0.4) || 1),
	);
	const visibleRows = command.sourceRows.slice(0, maxRows);
	if (command.sourceRows.length > maxRows) {
		visibleRows[visibleRows.length - 1] =
			`${visibleRows[visibleRows.length - 1]} ...`;
	}

	const rowHeight = getTerminalRowHeight(terminal);
	const rowCount = Math.max(1, visibleRows.length);
	runtime.overlay.hidden = false;
	runtime.overlay.style.height = `${rowCount * rowHeight}px`;
	runtime.overlay.style.setProperty(
		"--terminal-sticky-command-rows",
		`${rowCount}`,
	);
	runtime.content.textContent = visibleRows.join("\n");
	runtime.content.style.fontFamily =
		typeof terminal.options.fontFamily === "string"
			? terminal.options.fontFamily
			: "";
	runtime.content.style.fontSize =
		typeof terminal.options.fontSize === "number"
			? `${terminal.options.fontSize}px`
			: "";
	runtime.content.style.lineHeight = `${rowHeight}px`;
	runtime.content.style.letterSpacing =
		typeof terminal.options.letterSpacing === "number"
			? `${terminal.options.letterSpacing}px`
			: "";
}

function getTerminalRowHeight(terminal: Terminal): number {
	const terminalElement = terminal.element;
	if (terminalElement && terminal.rows > 0) {
		const height = terminalElement.getBoundingClientRect().height;
		if (height > 0) return height / terminal.rows;
	}

	const fontSize =
		typeof terminal.options.fontSize === "number"
			? terminal.options.fontSize
			: 14;
	return fontSize * 1.2;
}

function hideStickyCommand(runtime: StickyCommandRuntime): void {
	runtime.overlay.hidden = true;
	runtime.content.textContent = "";
}

function clearStickyCommandHistory(terminalId: string): void {
	const runtime = terminalStickyCommands.get(terminalId);
	if (!runtime) return;

	clearStickyCommandRecords(runtime);
	runtime.pendingCommands = [];
	runtime.inputState.line = "";
	hideStickyCommand(runtime);
}

function clearStickyCommandRecords(runtime: StickyCommandRuntime): void {
	for (const command of runtime.commands) {
		command.marker.dispose();
	}
	runtime.commands = [];
}

// ─── Touch scroll with inertia ────────────────────────────────
function attachTouchScroll(
	container: TerminalHTMLElement,
	xterm: Terminal,
	disposers: Array<() => void>,
): void {
	const viewport = container.querySelector(
		".xterm-viewport",
	) as HTMLElement | null;
	if (!viewport) return;

	// Overlay sits above all xterm canvas layers and captures every touch.
	// Scroll gestures use xterm.scrollLines() — the official API — to avoid
	// depending on xterm's internal scroll event handling of scrollTop changes
	// (which can silently fail in some Android WebView builds).
	// Taps focus the xterm textarea so the keyboard appears reliably.
	const overlay = document.createElement("div");
	overlay.className = "touch-scroll-overlay";
	container.appendChild(overlay);
	const wheelTarget =
		(container.querySelector(".xterm-screen") as HTMLElement | null) ??
		(container.querySelector(".xterm") as HTMLElement | null) ??
		viewport;

	let rafId = 0;
	let velocity = 0; // pixels per frame
	let pixelAccum = 0; // sub-line pixel remainder
	let lastY = 0;
	let lastX = 0;
	let lastTime = 0;
	let totalMovement = 0;
	let touchStartTime = 0;
	let longTapTimeout: number | null = null;
	let preventScrolling = false;

	const samples: number[] = [];
	const MAX_SAMPLES = 5;
	const FRICTION = 0.92; // per-frame at 60fps
	const STOP_THRESHOLD = 0.5; // px/frame — stop inertia below this

	// Compute actual line height in pixels from the viewport scroll area.
	// This runs during gestures when the container is in the live DOM and has
	// real layout dimensions.
	function getLineHeight(): number {
		const scrollArea = viewport?.firstElementChild as HTMLElement | null;
		if (scrollArea && scrollArea.scrollHeight > 0) {
			const totalLines = xterm.buffer.active.baseY + xterm.rows;
			if (totalLines > 0) {
				return scrollArea.scrollHeight / totalLines;
			}
		}
		const fs =
			typeof xterm.options.fontSize === "number" ? xterm.options.fontSize : 14;
		return fs * 1.2;
	}

	function usesAlternateScreen(): boolean {
		return xterm.buffer.active.type === "alternate";
	}

	function dispatchWheelGesture(
		deltaY: number,
		clientX: number,
		clientY: number,
	) {
		const target = wheelTarget;
		if (!target) {
			return;
		}

		target.dispatchEvent(
			new WheelEvent("wheel", {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY,
				deltaX: 0,
				deltaY,
				deltaMode: WheelEvent.DOM_DELTA_PIXEL,
			}),
		);
	}

	let isOurScroll = false;
	let lastKnownScrollPos = 0;
	let userScrolledUp = false;

	function scrollByPixels(px: number, clientX: number, clientY: number) {
		if (usesAlternateScreen()) {
			dispatchWheelGesture(px, clientX, clientY);
			return;
		}

		const lineH = getLineHeight();
		pixelAccum += px;
		const lines = Math.trunc(pixelAccum / lineH);
		if (lines !== 0) {
			isOurScroll = true;
			xterm.scrollLines(lines);
			isOurScroll = false;
			pixelAccum -= lines * lineH;
		}
	}

	function cancelInertia() {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
	}

	function inertiaLoop() {
		velocity *= FRICTION;
		scrollByPixels(velocity, lastX, lastY);
		if (Math.abs(velocity) < STOP_THRESHOLD) {
			rafId = 0;
			pixelAccum = 0;
			return;
		}
		rafId = requestAnimationFrame(inertiaLoop);
	}

	function onTouchStart(e: TouchEvent) {
		const target = e.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		preventScrolling = target.classList.contains("slider");

		if (preventScrolling) return;

		const touch = e.touches[0];

		if (longTapTimeout !== null) window.clearTimeout(longTapTimeout);
		updateAndroidKeyboardSuggestionsForTerminalFocus(true);
		overlay.style.pointerEvents = "";
		cancelInertia();
		lastX = touch.clientX;
		lastY = touch.clientY;
		lastTime = performance.now();
		touchStartTime = lastTime;
		totalMovement = 0;
		velocity = 0;
		pixelAccum = 0;
		samples.length = 0;

		if (isAndroidSystemGestureEdge(touch.clientX)) return;

		if (!process.env.IS_DESKTOP_UI) {
			longTapTimeout = window.setTimeout(() => {
				longTapTimeout = null;
				const parent = container.closest(".terminal-container");
				parent?.dispatchEvent(
					new PointerEvent("contextmenu", {
						bubbles: true,
						cancelable: true,
						clientX: lastX,
						clientY: lastY,
					}),
				);
			}, 500);
		}
	}

	// How many pixels of movement before we commit to a scroll (vs a tap).
	const SCROLL_CONFIRM_PX = 6;

	function onTouchMove(e: TouchEvent) {
		if (preventScrolling) return;

		if (longTapTimeout !== null) {
			window.clearTimeout(longTapTimeout);
			longTapTimeout = null;
		}

		const touch = e.touches[0];
		const now = performance.now();
		const dt = now - lastTime;
		const dy = lastY - touch.clientY; // positive = finger moved up = scroll down

		totalMovement += Math.abs(dy);

		// Convert pixel delta → lines via xterm's official API
		scrollByPixels(dy, touch.clientX, touch.clientY);
		// Track velocity in pixels/frame for inertia
		if (dt > 0) {
			samples.push((dy / dt) * 16.67);
			if (samples.length > MAX_SAMPLES) samples.shift();
		}
		lastX = touch.clientX;
		lastY = touch.clientY;
		lastTime = now;

		// Suppress native scroll/zoom only once a scroll is confirmed so we
		// don't break the browser's touch→mouse synthesis for short touches.
		if (totalMovement > SCROLL_CONFIRM_PX) {
			e.preventDefault();
		}
	}

	function onTouchEnd(e: TouchEvent) {
		if (preventScrolling) return;

		if (longTapTimeout !== null) {
			window.clearTimeout(longTapTimeout);
			longTapTimeout = null;
		}

		const duration = performance.now() - touchStartTime;
		const changedTouch = e.changedTouches[0];

		if (totalMovement < 8 && duration < 250) {
			overlay.style.pointerEvents = "none";

			const x = changedTouch.clientX;
			const y = changedTouch.clientY;
			const target = document.elementFromPoint(x, y);
			if (target) {
				// button: 0 = left; buttons: 1 = left held (required on mousedown).
				target.dispatchEvent(
					new MouseEvent("mousedown", {
						bubbles: true,
						cancelable: true,
						clientX: x,
						clientY: y,
						button: 0,
						buttons: 1,
					}),
				);
				target.dispatchEvent(
					new MouseEvent("mouseup", {
						bubbles: true,
						cancelable: true,
						clientX: x,
						clientY: y,
						button: 0,
						buttons: 0,
					}),
				);
				target.dispatchEvent(
					new MouseEvent("click", {
						bubbles: true,
						cancelable: true,
						clientX: x,
						clientY: y,
						button: 0,
						buttons: 0,
					}),
				);
			}

			// Focus the textarea so the keyboard appears. xterm also focuses it
			// internally on mousedown, but being explicit here is safer.
			const textarea = container.querySelector(
				"textarea.xterm-helper-textarea",
			) as HTMLTextAreaElement | null;
			textarea?.focus();

			setTimeout(() => {
				container.style.pointerEvents = "";
			}, 300);
			return;
		}

		if (!container.contains(document.activeElement)) {
			setAndroidKeyboardSuggestionsEnabled(true);
		}

		if (samples.length > 0) {
			const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
			velocity = avg * 1.1;
			rafId = requestAnimationFrame(inertiaLoop);
		}
	}

	function onTouchCancel() {
		if (longTapTimeout !== null) {
			window.clearTimeout(longTapTimeout);
			longTapTimeout = null;
		}
		if (!container.contains(document.activeElement)) {
			setAndroidKeyboardSuggestionsEnabled(true);
		}
	}

	container.addEventListener("touchstart", onTouchStart, { passive: true });
	container.addEventListener("touchmove", onTouchMove, { passive: false });
	container.addEventListener("touchend", onTouchEnd, { passive: true });
	container.addEventListener("touchcancel", onTouchCancel, { passive: true });

	const scrollListener = xterm.onScroll((newPosition) => {
		if (isOurScroll) {
			userScrolledUp = newPosition < xterm.buffer.active.baseY;
			lastKnownScrollPos = newPosition;
			return;
		}
		if (userScrolledUp) {
			const delta = newPosition - lastKnownScrollPos;
			if (delta !== 0) {
				isOurScroll = true;
				xterm.scrollLines(-delta);
				isOurScroll = false;
			}
			return;
		}
		lastKnownScrollPos = newPosition;
	});

	disposers.push(() => {
		container.removeEventListener("touchstart", onTouchStart);
		container.removeEventListener("touchmove", onTouchMove);
		container.removeEventListener("touchend", onTouchEnd);
		container.removeEventListener("touchcancel", onTouchCancel);
		if (longTapTimeout !== null) window.clearTimeout(longTapTimeout);
		scrollListener.dispose();
		cancelInertia();
	});
}

export function isAndroidSystemGestureEdge(clientX: number): boolean {
	if (!process.env.IS_ANDROID) return false;
	const edgeWidth = 32;
	return clientX <= edgeWidth || window.innerWidth - clientX <= edgeWidth;
}

function shouldAttachTouchScroll(): boolean {
	if (typeof window === "undefined" || typeof navigator === "undefined") {
		return false;
	}

	const primaryPointerIsCoarse =
		typeof window.matchMedia === "function" &&
		window.matchMedia("(pointer: coarse)").matches;

	return primaryPointerIsCoarse && (navigator.maxTouchPoints ?? 0) > 0;
}

const DEFAULT_XTERM_THEME: ITheme = {
	background: "#000000",
	foreground: "#ffffff",
	cursor: "#ffffff",
	cursorAccent: "#000000",
	selectionBackground: "rgba(255, 255, 255, 0.18)",
	selectionInactiveBackground: "rgba(255, 255, 255, 0.12)",
};
let stopThemeSync: (() => void) | null = null;

function setAndroidKeyboardSuggestionsEnabled(enabled: boolean) {
	if (!process.env.IS_ANDROID) {
		return;
	}

	import("bridge/native")
		.then(({ default: native }) =>
			native.setKeyboardSuggestionsEnabled(enabled),
		)
		.catch((error) => {
			console.warn("Failed to update Android keyboard suggestions:", error);
		});
}

function updateAndroidKeyboardSuggestionsForTerminalFocus(focused: boolean) {
	setAndroidKeyboardSuggestionsEnabled(!focused);
}

function applyTerminalKeyboardSuggestionAttributes(
	textarea: HTMLTextAreaElement,
) {
	textarea.setAttribute("autocomplete", "off");
	textarea.setAttribute("autocorrect", "off");
	textarea.setAttribute("autocapitalize", "none");
	textarea.setAttribute("spellcheck", "false");
	textarea.setAttribute("data-form-type", "other");
}

function ensureTerminalThemeSync() {
	if (stopThemeSync) {
		return;
	}

	stopThemeSync = themes.subscribe((theme) => {
		for (const { terminal } of terminalEntries.values()) {
			terminal.options.theme = theme.xtermTheme;
		}
	});
}

function applyTerminalSettings(xterm: Terminal, settings: TerminalSettings) {
	xterm.options.fontSize = settings.fontSize;
	xterm.options.fontFamily = getFontFamilyStack(settings.fontFamily);
	xterm.options.cursorStyle = settings.cursorStyle;
	xterm.options.cursorInactiveStyle = settings.cursorInactiveStyle;
	xterm.options.cursorBlink = settings.cursorBlink;
	xterm.options.scrollback = settings.scrollback;
	xterm.options.letterSpacing = settings.letterSpacing;
}

window.addEventListener(SETTINGS_CHANGED_EVENT, (event) => {
	const settings =
		(event as CustomEvent<AppSettings>).detail?.terminal ??
		DEFAULT_TERMINAL_SETTINGS;
	for (const { terminal, container } of terminalEntries.values()) {
		applyTerminalSettings(terminal, settings);
		const textarea = container.querySelector(
			"textarea.xterm-helper-textarea",
		) as HTMLTextAreaElement | null;
		if (textarea) {
			applyTerminalKeyboardSuggestionAttributes(textarea);
		}
		container.fit?.();
		const terminalId = container.dataset.terminalId;
		if (terminalId) queueStickyCommandRefresh(terminalId);
	}

	if (
		process.env.IS_ANDROID &&
		document.activeElement instanceof HTMLTextAreaElement &&
		document.activeElement.classList.contains("xterm-helper-textarea")
	) {
		updateAndroidKeyboardSuggestionsForTerminalFocus(true);
	}
});

function configureTerminalInput(
	container: TerminalHTMLElement,
	xterm: Terminal,
) {
	const textarea = container.querySelector(
		"textarea.xterm-helper-textarea",
	) as HTMLTextAreaElement | null;
	if (!textarea) {
		return;
	}

	applyTerminalKeyboardSuggestionAttributes(textarea);
	textarea.style.setProperty("-webkit-user-select", "text");
	textarea.style.setProperty("-webkit-touch-callout", "none");

	if (process.env.IS_ANDROID) {
		const onBeforeFocus = () =>
			updateAndroidKeyboardSuggestionsForTerminalFocus(true);
		const onFocus = () =>
			updateAndroidKeyboardSuggestionsForTerminalFocus(true);
		const onBlur = () => setAndroidKeyboardSuggestionsEnabled(true);

		textarea.addEventListener("touchstart", onBeforeFocus, { passive: true });
		textarea.addEventListener("mousedown", onBeforeFocus);
		textarea.addEventListener("focus", onFocus);
		textarea.addEventListener("blur", onBlur);
	}

	// iOS: backspace key repeat workaround — iOS WKWebView doesn't fire
	// repeated keydown events for the delete key on xterm's hidden textarea.
	// Instead, we keep a sentinel character in the textarea and listen for
	// deleteContentBackward input events, which iOS DOES fire repeatedly
	// while holding backspace.
	if (process.env.IS_IOS) {
		const SENTINEL = "\u200B"; // zero-width space

		const ensureSentinel = () => {
			if (!textarea.value.includes(SENTINEL)) {
				textarea.value = SENTINEL;
				textarea.selectionStart = textarea.selectionEnd = 1;
			}
		};

		// Seed the sentinel on focus
		textarea.addEventListener("focus", ensureSentinel);
		ensureSentinel();

		textarea.addEventListener("beforeinput", (e) => {
			if (e.inputType === "deleteContentBackward") {
				e.preventDefault();
				xterm.input("\x7f");
				// Restore sentinel so the next backspace has something to delete
				requestAnimationFrame(ensureSentinel);
			}
		});
	}
}

async function createXtermInstance(
	TerminalCtor: typeof Terminal,
	FitAddonCtor: typeof FitAddon,
	WebLinksAddonCtor: typeof WebLinksAddon,
	container: TerminalHTMLElement,
) {
	ensureTerminalThemeSync();
	const settings = (await loadSettings()).terminal;

	const xterm = new TerminalCtor({
		fontSize: settings.fontSize,
		fontFamily: getFontFamilyStack(settings.fontFamily),
		theme: themes.current?.xtermTheme ?? DEFAULT_XTERM_THEME,
		cursorStyle: settings.cursorStyle,
		cursorInactiveStyle: settings.cursorInactiveStyle,
		cursorBlink: settings.cursorBlink,
		allowProposedApi: true,
		scrollback: settings.scrollback,
		letterSpacing: settings.letterSpacing,
		overviewRuler: {
			width: 4,
		},
	});

	(window as unknown as { terminal?: Terminal }).terminal = xterm; // for debugging

	const fitAddon = new FitAddonCtor();
	xterm.loadAddon(fitAddon);
	xterm.loadAddon(
		new WebLinksAddonCtor((event, url) => {
			event.preventDefault();
			import("bridge/browser").then(({ default: browser }) => {
				browser.open(url);
			});
		}),
	);
	xterm.open(container);
	configureTerminalInput(container, xterm);

	return { xterm, fitAddon };
}

export async function createTerminal(options?: {
	cwd?: string;
}): Promise<string | null> {
	const { connectionStatus } = getConnectionSnapshot();
	if (connectionStatus !== "connected") {
		console.error(
			"Cannot create terminal: not connected (status: " +
				connectionStatus +
				")",
		);
		return null;
	}

	if (!unlistenData || !unlistenClosed) {
		console.warn("[Terminals] Listeners not initialized, re-initializing...");
		initTerminalListeners();
		if (!unlistenData || !unlistenClosed) {
			console.error(
				"Cannot create terminal: listeners failed to initialize after retry.",
			);
			return null;
		}
	}

	const response = await sendRequest<TerminalCreateResultMsg>({
		type: MsgType.TERMINAL_CREATE,
		data: { cols: 80, rows: 24, ...(options?.cwd ? { cwd: options.cwd } : {}) },
	});

	if (response.error || !response.data?.terminalId) {
		console.error("Failed to create terminal:", response.error);
		return null;
	}

	const { terminalId, shell = "" } = response.data;
	attachToTerminal(terminalId, shell, true);
	return terminalId;
}

// ─── Attach to existing terminal ──────────────────────────────
export async function attachToTerminal(
	terminalId: string,
	shell: string,
	newTerminal = false,
): Promise<boolean> {
	// Guard: ensure connection is stable before attaching
	const { connectionStatus } = getConnectionSnapshot();
	if (connectionStatus !== "connected") {
		console.error(
			"Cannot attach to terminal: not connected (status: " +
				connectionStatus +
				")",
		);
		return false;
	}

	const { Terminal } = await import("@xterm/xterm");
	const { FitAddon } = await import("@xterm/addon-fit");
	const { WebLinksAddon } = await import("@xterm/addon-web-links");

	const disposers: Array<() => void> = [];

	// Create container div and xterm instance
	const container = document.createElement("div") as TerminalHTMLElement;
	container.className = "xterm-wrapper";
	container.dataset.terminalId = terminalId;

	const { xterm, fitAddon } = await createXtermInstance(
		Terminal,
		FitAddon,
		WebLinksAddon,
		container,
	);

	if (shouldAttachTouchScroll()) {
		attachTouchScroll(container, xterm, disposers);
	}
	attachStickyCommandHeader(terminalId, container, xterm, disposers);

	// Attach to existing CLI PTY session
	const response = await sendRequest<TerminalAttachResultMsg>({
		type: MsgType.TERMINAL_ATTACH,
		data: {
			terminalId,
			cols: 80,
			rows: 24,
		},
	});

	if (response.error) {
		console.error("Failed to attach to terminal:", response.error);
		for (const dispose of disposers) dispose();
		xterm.dispose();
		container.remove();
		return false;
	}

	const snapshot = response.data?.snapshot;
	if (!snapshot && !newTerminal) {
		console.error(
			`[Terminals] Missing serialized snapshot for terminal ${terminalId}`,
		);
		for (const dispose of disposers) dispose();
		xterm.dispose();
		container.remove();
		return false;
	}

	// Wire user input → relay → CLI PTY stdin
	disposers.push(
		xterm.onData((data: string) => {
			// Check for active modifiers and apply them
			const modifiers = getModifierState(terminalId);
			let processedData = data;

			// Apply modifiers if any are active
			if (modifiers.ctrl || modifiers.alt || modifiers.shift) {
				processedData = transformWithModifiers(data, modifiers);
				// Reset modifiers after processing one key
				resetModifiers(terminalId);
			}

			sendTerminalInput(terminalId, processedData);
		}).dispose,
	);

	const sendTerminalResize = ({
		cols,
		rows,
	}: {
		cols: number;
		rows: number;
	}) => {
		sendMessage({
			type: MsgType.TERMINAL_RESIZE,
			data: { terminalId, cols, rows },
		});
	};
	const resizeThrottle = process.env.IS_DESKTOP_UI
		? createTerminalResizeThrottle(sendTerminalResize)
		: null;

	// Wire resize. Desktop fits visually every frame but limits remote PTY
	// updates; touch-native clients retain their existing immediate behavior.
	disposers.push(
		xterm.onResize(({ cols, rows }: { cols: number; rows: number }) => {
			if (resizeThrottle) resizeThrottle.schedule({ cols, rows });
			else sendTerminalResize({ cols, rows });
		}).dispose,
	);
	if (resizeThrottle) disposers.push(resizeThrottle.dispose);

	if (snapshot) {
		xterm.write(textifyEmoji(snapshot));
	}

	container.fit = () => {
		try {
			fitAddon.fit();
		} catch {}
	};
	terminalEntries.set(terminalId, {
		container,
		terminal: xterm,
		needsInitialScroll: true,
	});

	if (process.env.IS_DESKTOP_UI) {
		let keepAtBottom: boolean | undefined;
		let fittedGrid: { cols: number; rows: number } | undefined;
		const fitDesktopTerminal = () => {
			try {
				if (container.offsetWidth <= 0 || container.offsetHeight <= 0) return;
				const proposed = fitAddon.proposeDimensions();
				if (
					!proposed ||
					(fittedGrid?.cols === proposed.cols &&
						fittedGrid.rows === proposed.rows)
				) {
					return;
				}
				const entry = terminalEntries.get(terminalId);
				const buffer = xterm.buffer.active;
				keepAtBottom ??=
					Boolean(entry?.needsInitialScroll) ||
					buffer.viewportY >= buffer.baseY;
				fittedGrid = proposed;
				fitAddon.fit();
			} catch {}
		};
		const stopObservingSize = observeElementResize(container, {
			onFrame: fitDesktopTerminal,
			onSettled: () => {
				fitDesktopTerminal();
				resizeThrottle?.flush();
				const entry = terminalEntries.get(terminalId);
				if (entry?.needsInitialScroll) entry.needsInitialScroll = false;
				if (keepAtBottom) xterm.scrollToBottom();
				keepAtBottom = undefined;
				queueStickyCommandRefresh(terminalId);
			},
			delivery: "pre-paint",
		});
		disposers.push(stopObservingSize);
	} else {
		let fitTimeout: ReturnType<typeof setTimeout> | undefined;
		const ro = new ResizeObserver(() => {
			clearTimeout(fitTimeout);
			fitTimeout = setTimeout(() => {
				try {
					if (container.offsetWidth > 0 && container.offsetHeight > 0) {
						fitAddon.fit();
						const entry = terminalEntries.get(terminalId);
						const buf = xterm.buffer.active;
						if (entry?.needsInitialScroll) {
							entry.needsInitialScroll = false;
							xterm.scrollToBottom();
							setTimeout(() => {
								(
									xterm as unknown as {
										_core: { scrollToBottom: (val: boolean) => void };
									}
								)._core.scrollToBottom(true);
							}, 30);
						} else if (buf.viewportY >= buf.baseY) {
							xterm.scrollToBottom();
							setTimeout(() => {
								(
									xterm as unknown as {
										_core: { scrollToBottom: (val: boolean) => void };
									}
								)._core.scrollToBottom(true);
							}, 100);
						}
					}
				} catch {}
			}, 50);
		});
		ro.observe(container);
		disposers.push(() => {
			ro.disconnect();
			clearTimeout(fitTimeout);
		});
	}

	terminalDisposers.set(terminalId, disposers);
	terminalShells.set(terminalId, shell);

	// Add to active terminals if not already present
	const existing = _activeTerminals.find((t) => t.terminalId === terminalId);
	if (!existing) {
		_activeTerminals = [..._activeTerminals, { terminalId, shell }];
	}

	// Set as active terminal if none is selected
	if (!_activeTerminalId) {
		_activeTerminalId = terminalId;
	}

	emit();

	// Defer fit until after React mounts the container to DOM
	// This ensures xterm renders with proper dimensions
	if (!process.env.IS_DESKTOP_UI) {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				try {
					if (container.offsetWidth > 0 && container.offsetHeight > 0) {
						fitAddon.fit();
						// biome-ignore lint/suspicious/noExplicitAny: private xterm API
						(xterm as any)._core.scrollToBottom(true);
					}
				} catch (err) {
					console.warn(`Failed to fit terminal ${terminalId}:`, err);
				}
			});
		});
	}

	if (newTerminal) {
		setActiveTerminalId(terminalId);
	}

	return true;
}

/**
 * Re-sync an already-mounted terminal in place after a reconnect. Reuses the
 * existing xterm instance and DOM (no dispose, no flash) and overwrites its
 * buffer with the CLI's fresh snapshot, which is the source of truth. The input
 * and resize disposers do not need rebinding: they route through the live
 * `sendMessage`/`sendRequest`, which resolve the current connection at call
 * time.
 */
async function resyncExistingTerminal(terminalId: string): Promise<boolean> {
	const entry = terminalEntries.get(terminalId);
	if (!entry) return false;

	const response = await sendRequest<TerminalAttachResultMsg>({
		type: MsgType.TERMINAL_ATTACH,
		data: { terminalId, cols: 80, rows: 24 },
	});

	if (response.error) {
		console.error("Failed to re-attach to terminal:", response.error);
		return false;
	}

	const snapshot = response.data?.snapshot;
	const { terminal } = entry;
	if (snapshot) {
		// Replace the frozen buffer with the authoritative CLI snapshot.
		clearStickyCommandHistory(terminalId);
		terminal.reset();
		terminal.write(textifyEmoji(snapshot));
		entry.needsInitialScroll = true;
		try {
			entry.container.fit?.();
			terminal.scrollToBottom();
		} catch {}
	}

	return true;
}

/**
 * Restore terminals after a reconnect while preserving the on-screen UI.
 * Terminals that still exist on the CLI and are already mounted are re-synced in
 * place; brand-new ones are attached normally; ones that disappeared server-side
 * are cleaned up individually. Listeners are re-bound to the new connection.
 */
export async function restoreTerminalSessions(
	liveTerminals: RemoteTerminalInfo[],
): Promise<void> {
	initTerminalListeners();

	const liveIds = new Set(liveTerminals.map((t) => t.terminalId));

	// Drop terminals that no longer exist on the CLI.
	for (const terminalId of [...terminalEntries.keys()]) {
		if (!liveIds.has(terminalId)) {
			cleanupTerminal(terminalId);
			_activeTerminals = _activeTerminals.filter(
				(t) => t.terminalId !== terminalId,
			);
		}
	}

	for (const terminal of liveTerminals) {
		if (terminalEntries.has(terminal.terminalId)) {
			await resyncExistingTerminal(terminal.terminalId);
		} else {
			await attachToTerminal(terminal.terminalId, terminal.shell);
		}
	}

	if (_activeTerminalId && !liveIds.has(_activeTerminalId)) {
		_activeTerminalId = _activeTerminals[0]?.terminalId ?? null;
	}

	emit();
}

export function isTerminalBusy(terminalId: string): boolean {
	const terminal = terminalEntries.get(terminalId)?.terminal;
	if (!terminal) return false;
	const activeBuffer = terminal.buffer.active;
	const lastLineIndex = activeBuffer.length - 1;
	for (let i = lastLineIndex; i >= Math.max(0, lastLineIndex - 20); i--) {
		const line = activeBuffer.getLine(i)?.translateToString(true).trimEnd();
		if (line) return !/[$%#>]\s*$/.test(line);
	}
	return false;
}

export function closeTerminal(terminalId: string) {
	sendMessage({
		type: MsgType.TERMINAL_CLOSE,
		data: { terminalId },
	});
	cleanupTerminal(terminalId);
	_activeTerminals = _activeTerminals.filter(
		(t) => t.terminalId !== terminalId,
	);
	if (_activeTerminalId === terminalId) {
		_activeTerminalId = _activeTerminals[0]?.terminalId ?? null;
	}
	emit();
}

function cleanupTerminal(relayId: string) {
	const disposers = terminalDisposers.get(relayId);
	if (disposers) {
		for (const d of disposers) d();
		terminalDisposers.delete(relayId);
	}

	const entry = terminalEntries.get(relayId);
	if (entry) {
		if (
			process.env.IS_ANDROID &&
			entry.container.contains(document.activeElement)
		) {
			setAndroidKeyboardSuggestionsEnabled(true);
		}
		clearStickyCommandHistory(relayId);
		entry.terminal.dispose();
		entry.container.remove();
		terminalEntries.delete(relayId);
	}

	terminalShells.delete(relayId);

	// Clear terminal title/process
	const processes = { ..._terminalProcesses };
	delete processes[relayId];
	_terminalProcesses = processes;

	const names = { ..._terminalNames };
	delete names[relayId];
	_terminalNames = names;
}

/**
 * Detach the connection-bound message listeners without tearing down any
 * terminal UI. Used on a transient disconnect so the existing xterm tiles stay
 * mounted and frozen on screen while we reconnect — the user keeps seeing their
 * last terminal state instead of a blank rebuild. The CLI snapshot is re-synced
 * in place once the connection is restored (see {@link restoreTerminalSessions}).
 */
export function detachTerminalListeners(): void {
	unlistenData?.();
	unlistenClosed?.();
	unlistenTitle?.();
	unlistenData = null;
	unlistenClosed = null;
	unlistenTitle = null;
}

export function detachAllTerminals(close = false): void {
	unlistenData?.();
	unlistenClosed?.();
	unlistenTitle?.();
	unlistenData = null;
	unlistenClosed = null;
	unlistenTitle = null;

	if (close) {
		for (const [relayId] of terminalEntries) {
			sendMessage({
				type: MsgType.TERMINAL_CLOSE,
				data: { terminalId: relayId },
			});
		}
	}

	for (const [, disposers] of terminalDisposers) {
		for (const dispose of disposers) dispose();
	}
	for (const [, entry] of terminalEntries) {
		clearStickyCommandHistory(entry.container.dataset.terminalId ?? "");
		entry.terminal.dispose();
		entry.container.remove();
	}

	terminalEntries.clear();
	terminalDisposers.clear();
	terminalShells.clear();
	terminalStickyCommands.clear();

	_activeTerminals = [];
	_activeTerminalId = null;
	_terminalNames = {};
	_terminalProcesses = {};
	emit();
}

export async function fetchTerminalList(): Promise<RemoteTerminalInfo[]> {
	const res = await sendRequest<TerminalListResultMsg>({
		type: MsgType.TERMINAL_LIST,
	});
	if (res.error || !res.data?.terminals) return [];
	return res.data.terminals;
}
