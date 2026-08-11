import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clampPanelPercent,
	DEFAULT_PANEL_PERCENT,
	type ErudaRuntime,
	installShellularDeveloperTools,
	MAX_PANEL_PERCENT,
	MIN_PANEL_PERCENT,
	type ShellularDeveloperToolsState,
} from "./developerToolsRuntime";

type FakeEruda = ErudaRuntime & {
	initCount: number;
	selectedElement: Element | null;
	clearCount: number;
	shownTool: string | undefined;
	showCalls: Array<string | undefined>;
	panel: HTMLElement;
};

let testFrame: HTMLIFrameElement | null = null;

function installTestDOM() {
	const hostDocument = document;
	testFrame = hostDocument.createElement("iframe");
	hostDocument.body.appendChild(testFrame);
	const frameWindow = testFrame.contentWindow;
	const frameDocument = testFrame.contentDocument;
	if (!frameWindow || !frameDocument) {
		throw new Error("Could not create an isolated browser test frame");
	}
	const frameGlobals = frameWindow as Window & typeof globalThis;
	frameDocument.open();
	frameDocument.write("<!doctype html><html><head></head><body></body></html>");
	frameDocument.close();
	class TestResizeObserver {
		observe() {}
		disconnect() {}
		unobserve() {}
	}
	if (!frameWindow.requestAnimationFrame) {
		frameWindow.requestAnimationFrame = (callback: FrameRequestCallback) =>
			frameWindow.setTimeout(() => callback(Date.now()), 0);
	}
	vi.stubGlobal("window", frameWindow);
	vi.stubGlobal("document", frameDocument);
	vi.stubGlobal("Element", frameGlobals.Element);
	vi.stubGlobal("HTMLElement", frameGlobals.HTMLElement);
	vi.stubGlobal("MutationObserver", frameGlobals.MutationObserver);
	vi.stubGlobal("ResizeObserver", TestResizeObserver);
	return frameWindow;
}

function makeFakeEruda(): FakeEruda {
	const host = document.createElement("div");
	const shadowRoot = host.attachShadow({ mode: "open" });
	const panel = document.createElement("div");
	panel.className = "eruda-dev-tools";
	shadowRoot.appendChild(panel);
	document.documentElement.appendChild(host);

	let displaySize = DEFAULT_PANEL_PERCENT;
	const configListeners: Array<(name: string, value: unknown) => void> = [];
	const fake: FakeEruda = {
		initCount: 0,
		selectedElement: null,
		clearCount: 0,
		shownTool: undefined,
		showCalls: [],
		panel,
		_shadowRoot: shadowRoot,
		_devTools: {
			_isShow: false,
			config: {
				get(name: string) {
					return name === "displaySize" ? displaySize : undefined;
				},
				set(name: string, value: unknown) {
					if (name !== "displaySize" || typeof value !== "number") return;
					displaySize = value;
					for (const listener of configListeners) listener(name, value);
				},
				on(_event: "change", listener: (name: string, value: unknown) => void) {
					configListeners.push(listener);
				},
			},
		},
		init(options?: Record<string, unknown>) {
			fake.initCount += 1;
			const defaults = options?.defaults as
				| { displaySize?: number }
				| undefined;
			if (typeof defaults?.displaySize === "number") {
				displaySize = defaults.displaySize;
			}
		},
		show(tool?: string) {
			fake.showCalls.push(tool);
			if (tool !== undefined) {
				fake.shownTool = tool;
				return;
			}
			if (fake._devTools) fake._devTools._isShow = true;
			panel.style.display = "block";
		},
		hide() {
			if (fake._devTools) fake._devTools._isShow = false;
			window.setTimeout(() => {
				panel.style.display = "none";
			}, 300);
		},
		get(name: string) {
			if (name === "entryBtn") return { hide: vi.fn() };
			if (name === "elements") {
				return {
					select(target: Element) {
						fake.selectedElement = target;
					},
					_detail: {
						hide() {
							fake.clearCount += 1;
						},
					},
				};
			}
			return undefined;
		},
	};

	Object.defineProperty(panel, "getBoundingClientRect", {
		value: () => ({
			bottom: 800,
			height: (800 * displaySize) / 100,
			left: 0,
			right: 600,
			top: 800 - (800 * displaySize) / 100,
			width: 600,
			x: 0,
			y: 800 - (800 * displaySize) / 100,
			toJSON: () => ({}),
		}),
	});
	return fake;
}

async function settleDOM() {
	await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
	await new Promise<void>((resolve) =>
		window.requestAnimationFrame(() => resolve()),
	);
	await new Promise<void>((resolve) =>
		window.requestAnimationFrame(() => resolve()),
	);
}

describe("Shellular developer tools runtime", () => {
	beforeEach(() => {
		installTestDOM();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		testFrame?.remove();
		testFrame = null;
	});

	it("clamps panel size to the supported range", () => {
		expect(clampPanelPercent(Number.NaN)).toBe(DEFAULT_PANEL_PERCENT);
		expect(clampPanelPercent(5)).toBe(MIN_PANEL_PERCENT);
		expect(clampPanelPercent(50)).toBe(50);
		expect(clampPanelPercent(95)).toBe(MAX_PANEL_PERCENT);
	});

	it("installs one versioned runtime and publishes validated state", () => {
		const messages: ShellularDeveloperToolsState[] = [];
		Object.defineProperty(window, "webkit", {
			configurable: true,
			value: {
				messageHandlers: {
					shellularDeveloperTools: {
						postMessage: (value: ShellularDeveloperToolsState) =>
							messages.push(value),
					},
				},
			},
		});
		const eruda = makeFakeEruda();
		const runtime = installShellularDeveloperTools(eruda, {
			panelPercent: 54,
		});
		const duplicate = installShellularDeveloperTools(eruda, {
			panelPercent: 57,
		});

		expect(duplicate).toBe(runtime);
		expect(eruda.initCount).toBe(1);
		expect(runtime.getState()).toEqual({
			version: 1,
			ready: true,
			visible: false,
			panelPercent: 57,
			highlighted: false,
		});
		expect(messages[messages.length - 1]).toEqual(runtime.getState());
	});

	it("writes clamped Eruda resizes back before publishing panel geometry", async () => {
		const messages: ShellularDeveloperToolsState[] = [];
		Object.defineProperty(window, "webkit", {
			configurable: true,
			value: {
				messageHandlers: {
					shellularDeveloperTools: {
						postMessage: (value: ShellularDeveloperToolsState) =>
							messages.push(value),
					},
				},
			},
		});
		const eruda = makeFakeEruda();
		const runtime = installShellularDeveloperTools(eruda, {
			panelPercent: 50,
		});
		runtime.show();
		const messageCountBeforeResize = messages.length;

		eruda._devTools?.config?.set?.("displaySize", 95);
		await settleDOM();

		expect(eruda._devTools?.config?.get?.("displaySize")).toBe(
			MAX_PANEL_PERCENT,
		);
		expect(runtime.getState().panelPercent).toBe(MAX_PANEL_PERCENT);
		expect(messages).toHaveLength(messageCountBeforeResize + 1);
		expect(messages[messages.length - 1]).toEqual(runtime.getState());
		expect(
			(
				document.getElementById(
					"__shellularDeveloperToolsSpacer",
				) as HTMLElement
			).style.height,
		).toBe("560px");
	});

	it("supports direct and legacy visibility controls", () => {
		const eruda = makeFakeEruda();
		const runtime = installShellularDeveloperTools(eruda);

		expect(runtime.show("network")).toBe(true);
		expect(runtime.getState().visible).toBe(true);
		expect(eruda.shownTool).toBe("network");
		expect(eruda.showCalls).toEqual(["network", undefined]);
		expect(eruda._devTools?._isShow).toBe(true);
		document.dispatchEvent(new Event("hideconsole"));
		expect(runtime.getState().visible).toBe(false);
		document.dispatchEvent(new Event("showconsole"));
		expect(runtime.getState().visible).toBe(true);
		expect(runtime.toggle()).toBe(true);
		expect(runtime.getState().visible).toBe(false);
	});

	it("selects and clears the element from the latest context menu", () => {
		const eruda = makeFakeEruda();
		const runtime = installShellularDeveloperTools(eruda);
		const button = document.createElement("button");
		button.id = "inspect-me";
		document.body.appendChild(button);
		button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

		expect(runtime.inspectElement()).toBe(true);
		expect(eruda.shownTool).toBe("elements");
		expect(eruda.showCalls).toEqual(["elements", undefined]);
		expect(eruda._devTools?._isShow).toBe(true);
		expect(eruda.selectedElement).toBe(button);
		expect(runtime.getState().highlighted).toBe(true);
		expect(runtime.clearHighlight()).toBe(true);
		expect(eruda.clearCount).toBeGreaterThan(0);
		expect(runtime.getState().highlighted).toBe(false);
	});

	it("keeps the panel visible when a delayed Eruda hide races a named show", async () => {
		const eruda = makeFakeEruda();
		const runtime = installShellularDeveloperTools(eruda);

		runtime.show();
		runtime.hide();
		runtime.show("elements");
		await new Promise<void>((resolve) => window.setTimeout(resolve, 450));
		await settleDOM();

		expect(runtime.getState().visible).toBe(true);
		expect(eruda._devTools?._isShow).toBe(true);
		expect(eruda.showCalls).toEqual([
			undefined,
			"elements",
			undefined,
			undefined,
		]);
		expect(eruda.panel.style.display).toBe("block");
		expect(eruda.shownTool).toBe("elements");
	});

	it("keeps one correctly sized spacer after content and body replacement", async () => {
		const eruda = makeFakeEruda();
		const runtime = installShellularDeveloperTools(eruda, {
			panelPercent: 50,
		});
		runtime.show();
		await settleDOM();

		const lateContent = document.createElement("main");
		document.body.appendChild(lateContent);
		await settleDOM();
		let spacer = document.getElementById(
			"__shellularDeveloperToolsSpacer",
		) as HTMLElement;
		expect(document.body.lastElementChild).toBe(spacer);
		expect(spacer.style.height).toBe("400px");

		const replacement = document.createElement("body");
		replacement.innerHTML = "<main id='replacement'>Replacement</main>";
		document.body.replaceWith(replacement);
		await settleDOM();
		spacer = document.getElementById(
			"__shellularDeveloperToolsSpacer",
		) as HTMLElement;
		expect(document.body.lastElementChild).toBe(spacer);
		expect(
			document.querySelectorAll("#__shellularDeveloperToolsSpacer"),
		).toHaveLength(1);
	});

	it("installs memory storage when WKWebView storage access throws", () => {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get: () => {
				throw new DOMException("Storage unavailable", "SecurityError");
			},
		});
		const eruda = makeFakeEruda();
		const runtime = installShellularDeveloperTools(eruda);

		expect(runtime.getState().ready).toBe(true);
		expect(() => window.localStorage.setItem("key", "value")).not.toThrow();
		expect(window.localStorage.getItem("key")).toBe("value");
	});
});
