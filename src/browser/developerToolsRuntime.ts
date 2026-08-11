import { installDeveloperToolsStorageFallback } from "./developerToolsStorage";

export const DEVELOPER_TOOLS_VERSION = 1 as const;
export const DEFAULT_PANEL_PERCENT = 45;
export const MIN_PANEL_PERCENT = 25;
export const MAX_PANEL_PERCENT = 70;

export type ShellularDeveloperTool =
	| "console"
	| "elements"
	| "network"
	| "resources"
	| "sources"
	| "info"
	| "snippets";

export type ShellularDeveloperToolsState = {
	version: typeof DEVELOPER_TOOLS_VERSION;
	ready: boolean;
	visible: boolean;
	panelPercent: number;
	highlighted: boolean;
};

export type ShellularDeveloperTools = {
	readonly version: typeof DEVELOPER_TOOLS_VERSION;
	show(tool?: ShellularDeveloperTool): boolean;
	hide(): boolean;
	toggle(): boolean;
	inspectElement(target?: Element | null): boolean;
	clearHighlight(): boolean;
	setPanelPercent(value: number): number;
	getState(): ShellularDeveloperToolsState;
};

type ErudaConfig = {
	get?(name: string): unknown;
	set?(name: string, value: unknown): void;
	on?(event: "change", listener: (name: string, value: unknown) => void): void;
};

type ErudaElements = {
	select?(target: Element): void;
	hide?(): void;
	_detail?: { hide?(): void };
};

export type ErudaRuntime = {
	init(options?: Record<string, unknown>): void;
	show(tool?: string): void;
	hide(): void;
	get?(name: string): unknown;
	_shadowRoot?: ShadowRoot;
	_devTools?: {
		_isShow?: boolean;
		config?: ErudaConfig;
		show?(): void;
		hide?(): void;
	};
};

type RuntimeWindow = Window &
	typeof globalThis & {
		eruda?: ErudaRuntime;
		__shellularDeveloperTools?: ShellularDeveloperTools;
		__shellularInstallDeveloperTools?: (
			options?: ShellularDeveloperToolsOptions,
		) => ShellularDeveloperTools;
		__shellularSetDeveloperToolsVisible?: (visible: boolean) => boolean;
		__shellularInspectContextElement?: () => boolean;
		__shellularClearElementHighlight?: () => boolean;
		webkit?: {
			messageHandlers?: Record<
				string,
				{ postMessage(value: ShellularDeveloperToolsState): void }
			>;
		};
	};

export type ShellularDeveloperToolsOptions = {
	panelPercent?: number;
	messageHandlerName?: string;
};

type RuntimeState = {
	ready: boolean;
	initializing: boolean;
	requestedVisible: boolean;
	appliedVisible: boolean;
	panelPercent: number;
	highlighted: boolean;
	contextTarget: Element | null;
	pendingInspectTarget: Element | null;
	spacer: HTMLElement | null;
	panel: HTMLElement | null;
	resizeObserver: ResizeObserver | null;
	panelObserver: MutationObserver | null;
	documentObserver: MutationObserver | null;
	bodyObserver: MutationObserver | null;
	observedBody: HTMLElement | null;
	visibilityReconciliationTimer: number | null;
	waitingForDocument: boolean;
	error: string | null;
	lastMessage: string;
};

const SPACER_ID = "__shellularDeveloperToolsSpacer";
const DEFAULT_MESSAGE_HANDLER = "shellularDeveloperTools";
const VISIBILITY_RECONCILIATION_DELAY_MS = 350;

export function clampPanelPercent(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_PANEL_PERCENT;
	return Math.min(MAX_PANEL_PERCENT, Math.max(MIN_PANEL_PERCENT, value));
}

export function installShellularDeveloperTools(
	eruda: ErudaRuntime,
	options: ShellularDeveloperToolsOptions = {},
): ShellularDeveloperTools {
	const runtimeWindow = window as RuntimeWindow;
	const existing = runtimeWindow.__shellularDeveloperTools;
	if (existing?.version === DEVELOPER_TOOLS_VERSION) {
		if (options.panelPercent !== undefined) {
			existing.setPanelPercent(options.panelPercent);
		}
		return existing;
	}

	const messageHandlerName =
		options.messageHandlerName || DEFAULT_MESSAGE_HANDLER;
	const state: RuntimeState = {
		ready: false,
		initializing: false,
		requestedVisible: false,
		appliedVisible: false,
		panelPercent: clampPanelPercent(
			options.panelPercent ?? DEFAULT_PANEL_PERCENT,
		),
		highlighted: false,
		contextTarget: null,
		pendingInspectTarget: null,
		spacer: null,
		panel: null,
		resizeObserver: null,
		panelObserver: null,
		documentObserver: null,
		bodyObserver: null,
		observedBody: null,
		visibilityReconciliationTimer: null,
		waitingForDocument: false,
		error: null,
		lastMessage: "",
	};

	function snapshot(): ShellularDeveloperToolsState {
		return {
			version: DEVELOPER_TOOLS_VERSION,
			ready: state.ready,
			visible: state.requestedVisible,
			panelPercent: state.panelPercent,
			highlighted: state.highlighted,
		};
	}

	function publishState(): void {
		const value = snapshot();
		const serialized = JSON.stringify(value);
		if (serialized === state.lastMessage) return;
		state.lastMessage = serialized;
		try {
			runtimeWindow.webkit?.messageHandlers?.[messageHandlerName]?.postMessage(
				value,
			);
		} catch {
			// Native state synchronization is optional. Diagnostics must continue
			// to work in ordinary browsers and on the existing mobile wrappers.
		}
	}

	function schedule(callback: () => void): void {
		const enqueue = runtimeWindow.requestAnimationFrame
			? runtimeWindow.requestAnimationFrame.bind(runtimeWindow)
			: (next: FrameRequestCallback) =>
					runtimeWindow.setTimeout(() => next(Date.now()), 0);
		enqueue(() => enqueue(() => callback()));
	}

	function elementsTool(): ErudaElements | null {
		try {
			return (eruda.get?.("elements") as ErudaElements | undefined) ?? null;
		} catch {
			return null;
		}
	}

	function clearHighlight(): boolean {
		state.pendingInspectTarget = null;
		const elements = elementsTool();
		let cleared = false;
		try {
			if (typeof elements?._detail?.hide === "function") {
				elements._detail.hide();
				cleared = true;
			} else if (typeof elements?.hide === "function") {
				elements.hide();
				cleared = true;
			}
		} catch {
			cleared = false;
		}
		state.highlighted = false;
		publishState();
		return cleared;
	}

	function placeSpacerAtDocumentEnd(): boolean {
		const body = document.body;
		if (!body || !state.spacer) return false;
		if (
			state.spacer.parentNode !== body ||
			state.spacer !== body.lastElementChild
		) {
			body.appendChild(state.spacer);
		}
		return true;
	}

	function observeBody(): void {
		const body = document.body;
		if (!body || body === state.observedBody) return;
		state.bodyObserver?.disconnect();
		state.observedBody = body;
		state.bodyObserver = new MutationObserver(() => {
			placeSpacerAtDocumentEnd();
		});
		state.bodyObserver.observe(body, { childList: true });
	}

	function panelFromEruda(): HTMLElement | null {
		return (
			(eruda._shadowRoot?.querySelector(
				".eruda-dev-tools",
			) as HTMLElement | null) ??
			document.querySelector<HTMLElement>(".eruda-dev-tools")
		);
	}

	function syncSpacer(): void {
		observeBody();
		if (!placeSpacerAtDocumentEnd() || !state.spacer) return;
		state.spacer.style.setProperty(
			"display",
			state.requestedVisible ? "block" : "none",
			"important",
		);
		const height =
			state.requestedVisible && state.panel
				? Math.max(0, Math.ceil(state.panel.getBoundingClientRect().height))
				: 0;
		state.spacer.style.setProperty("height", `${height}px`, "important");
	}

	function reconcileRequestedPanelVisibility(): void {
		if (
			state.requestedVisible &&
			eruda._devTools?._isShow === true &&
			state.panel &&
			(state.panel.style.display === "none" ||
				runtimeWindow.getComputedStyle(state.panel).display === "none")
		) {
			// Eruda hides with a delayed callback. If a hide is followed quickly by
			// show, that stale callback can hide an otherwise-visible panel. Re-show
			// when the DOM and Eruda's own visibility state disagree.
			eruda.show();
		}
	}

	function scheduleVisibilityReconciliation(): void {
		if (state.visibilityReconciliationTimer !== null) {
			runtimeWindow.clearTimeout(state.visibilityReconciliationTimer);
		}
		state.visibilityReconciliationTimer = runtimeWindow.setTimeout(() => {
			state.visibilityReconciliationTimer = null;
			reconcileRequestedPanelVisibility();
			syncSpacer();
		}, VISIBILITY_RECONCILIATION_DELAY_MS);
	}

	function syncVisibilityFromEruda(): void {
		const internalVisibility = eruda._devTools?._isShow;
		if (typeof internalVisibility !== "boolean") return;
		reconcileRequestedPanelVisibility();
		if (internalVisibility === state.requestedVisible) return;
		state.requestedVisible = internalVisibility;
		state.appliedVisible = internalVisibility;
		if (!internalVisibility) clearHighlight();
		syncSpacer();
		publishState();
	}

	function installPanelObservers(): void {
		const panel = panelFromEruda();
		if (!panel || panel === state.panel) return;
		state.resizeObserver?.disconnect();
		state.panelObserver?.disconnect();
		state.panel = panel;
		if (typeof ResizeObserver !== "undefined") {
			state.resizeObserver = new ResizeObserver(() => {
				syncSpacer();
				syncVisibilityFromEruda();
			});
			state.resizeObserver.observe(panel);
		}
		state.panelObserver = new MutationObserver(() => {
			syncVisibilityFromEruda();
			syncSpacer();
		});
		state.panelObserver.observe(panel, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});
	}

	function installSpacer(): void {
		if (!document.body) return;
		if (!state.spacer) {
			const spacer = document.createElement("div");
			spacer.id = SPACER_ID;
			spacer.setAttribute("aria-hidden", "true");
			spacer.style.cssText =
				"all:initial;display:none;width:100%;height:0;min-height:0;visibility:hidden;pointer-events:none;flex:none;";
			state.spacer = spacer;
		}
		installPanelObservers();
		syncSpacer();
		schedule(syncSpacer);
	}

	function applyPanelPercent(): number {
		state.panelPercent = clampPanelPercent(state.panelPercent);
		try {
			eruda._devTools?.config?.set?.("displaySize", state.panelPercent);
		} catch {
			// Keep the requested value even when an Eruda build lacks this API.
		}
		return state.panelPercent;
	}

	function applyVisibility(tool?: ShellularDeveloperTool): boolean {
		if (!state.ready) return true;
		if (state.requestedVisible) {
			// Eruda's named show overload only selects a tool. It does not reveal
			// the hidden developer-tools container, so selection and visibility
			// must be applied as two distinct operations.
			if (tool) eruda.show(tool);
			eruda.show();
			state.appliedVisible = true;
			scheduleVisibilityReconciliation();
		} else {
			if (state.visibilityReconciliationTimer !== null) {
				runtimeWindow.clearTimeout(state.visibilityReconciliationTimer);
				state.visibilityReconciliationTimer = null;
			}
			clearHighlight();
			if (state.appliedVisible || eruda._devTools?._isShow !== false) {
				eruda.hide();
			}
			state.appliedVisible = false;
		}
		installSpacer();
		publishState();
		return true;
	}

	function inspectElement(target?: Element | null): boolean {
		let candidate = target ?? state.contextTarget;
		if (
			!candidate ||
			candidate.ownerDocument !== document ||
			candidate.isConnected === false
		) {
			candidate = document.documentElement;
		}
		state.requestedVisible = true;
		state.highlighted = true;
		if (!state.ready) {
			state.pendingInspectTarget = candidate;
			initialize();
			publishState();
			return true;
		}
		applyVisibility("elements");
		try {
			elementsTool()?.select?.(candidate);
		} catch {
			state.highlighted = false;
		}
		installSpacer();
		publishState();
		return true;
	}

	function installDocumentObservers(): void {
		if (state.documentObserver || !document.documentElement) return;
		state.documentObserver = new MutationObserver(() => {
			observeBody();
			installSpacer();
		});
		state.documentObserver.observe(document.documentElement, {
			childList: true,
		});
	}

	function initialize(): void {
		if (state.ready || state.initializing) return;
		if (
			document.readyState === "loading" ||
			!document.documentElement ||
			!document.head ||
			!document.body
		) {
			if (!state.waitingForDocument) {
				state.waitingForDocument = true;
				const resume = () => {
					if (
						document.readyState === "loading" ||
						!document.documentElement ||
						!document.head ||
						!document.body
					) {
						return;
					}
					state.waitingForDocument = false;
					state.documentObserver?.disconnect();
					state.documentObserver = null;
					runtimeWindow.setTimeout(initialize, 0);
				};
				document.addEventListener("DOMContentLoaded", resume, { once: true });
				if (document.readyState !== "loading") {
					state.documentObserver = new MutationObserver(resume);
					state.documentObserver.observe(document, {
						childList: true,
						subtree: true,
					});
				}
			}
			return;
		}

		state.initializing = true;
		try {
			installDeveloperToolsStorageFallback(runtimeWindow, "localStorage");
			installDeveloperToolsStorageFallback(runtimeWindow, "sessionStorage");
			eruda.init({
				autoScale: false,
				defaults: {
					displaySize: state.panelPercent,
					theme: "System preference",
				},
			});
			const entryButton = eruda.get?.("entryBtn") as
				| { hide?(): void }
				| undefined;
			entryButton?.hide?.();
			let isCorrectingPanelPercent = false;
			eruda._devTools?.config?.on?.("change", (name, value) => {
				if (name !== "displaySize" || typeof value !== "number") return;
				if (isCorrectingPanelPercent) return;
				const next = clampPanelPercent(value);
				const didStateChange = next !== state.panelPercent;
				state.panelPercent = next;
				if (next !== value) {
					isCorrectingPanelPercent = true;
					applyPanelPercent();
					isCorrectingPanelPercent = false;
				}
				syncSpacer();
				if (didStateChange) publishState();
			});
			state.ready = true;
			state.initializing = false;
			installDocumentObservers();
			installSpacer();
			applyPanelPercent();
			if (state.pendingInspectTarget) {
				const pending = state.pendingInspectTarget;
				state.pendingInspectTarget = null;
				inspectElement(pending);
			} else {
				applyVisibility();
			}
			publishState();
		} catch (error) {
			state.initializing = false;
			state.error = String(error instanceof Error ? error.message : error);
			console.error("[Shellular Developer Tools]", error);
			publishState();
		}
	}

	const api: ShellularDeveloperTools = {
		version: DEVELOPER_TOOLS_VERSION,
		show(tool) {
			state.requestedVisible = true;
			initialize();
			return applyVisibility(tool);
		},
		hide() {
			state.requestedVisible = false;
			initialize();
			return applyVisibility();
		},
		toggle() {
			return state.requestedVisible ? api.hide() : api.show();
		},
		inspectElement,
		clearHighlight,
		setPanelPercent(value) {
			state.panelPercent = clampPanelPercent(value);
			if (state.ready) applyPanelPercent();
			syncSpacer();
			publishState();
			return state.panelPercent;
		},
		getState: snapshot,
	};

	runtimeWindow.__shellularDeveloperTools = api;
	runtimeWindow.__shellularSetDeveloperToolsVisible = (visible) =>
		visible ? api.show() : api.hide();
	runtimeWindow.__shellularInspectContextElement = () => api.inspectElement();
	runtimeWindow.__shellularClearElementHighlight = () => api.clearHighlight();

	document.addEventListener(
		"contextmenu",
		(event) => {
			state.contextTarget =
				event.target instanceof Element ? event.target : null;
		},
		true,
	);
	document.addEventListener("showconsole", () => api.show());
	document.addEventListener("hideconsole", () => api.hide());

	initialize();
	return api;
}
