import keyboard from "lib/keyboard";
import checkBrowser from "./checkBrowser";
import opfs from "./lib/opfs";
import services from "./services";
import file from "./services/file";
import scanner from "./services/scanner";

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
type BrowserServiceName = keyof typeof services;

const queries = new URLSearchParams(window.location.search);
const action = queries.get("action");
if (action) {
	if (window.opener) {
		window.opener.postMessage({ action: "intent", data: queries });
		window.close();
		throw new Error("Window closed");
	}

	const intentActions = JSON.parse(
		window.localStorage.getItem("intent-actions") || "[]",
	);
	intentActions.push(Object.fromEntries(queries.entries()));
	localStorage.setItem("intent-actions", JSON.stringify(intentActions));
	document.body.dataset.message = "Loading your request...";
	try {
		window.close();
	} catch (_error) {}
	throw new Error("This window can be closed now.");
}

navigator.serviceWorker.addEventListener("message", async (event) => {
	const { id, action, args = [] } = event.data;
	if (action) {
		switch (action) {
			case "readFile": {
				const buffer = await opfs.readFile(...(args as [string]));
				event.source?.postMessage({ id, result: buffer });
				break;
			}
			case "exists": {
				const exists = await opfs.exists(...(args as [string]));
				event.source?.postMessage({ id, result: exists });
				break;
			}
			default:
				console.warn(`Unknown action: ${action}`);
		}
		return;
	}
});

window.Bridge = {
	async exec(success, error, serviceName, actionName, args) {
		if (!isBrowserServiceName(serviceName)) {
			const err = new Error(`${serviceName} not found`);
			error(err);
			return;
		}

		const service = services[serviceName];
		if (!service) {
			const err = new Error(`${serviceName} not found`);
			error(err);
			return;
		}

		const action = service[actionName as keyof typeof service];
		if (!action) {
			const err = new Error(`${service}/${actionName} not found`);
			error(err);
			return;
		}

		(action as (callback: Callback, args: unknown[]) => unknown).call(
			service,
			{ success, error: (err) => error(new Error(err)) },
			args,
		);
	},
};

export default async function setup() {
	checkBrowser(isMobile);

	if ("virtualKeyboard" in navigator) {
		let keyboardShowEventEmitted = false;
		let keyboardHideEventEmitted = false;
		const emitKeyboardEvent = debounced((eventName: "show" | "hide") => {
			keyboard.emit(eventName);
		}, 100);
		const vk: {
			overlaysContent: boolean;
			addEventListener: VirtualKeyboard["addEventListener"];
		} = navigator.virtualKeyboard as unknown as {
			overlaysContent: boolean;
			addEventListener: VirtualKeyboard["addEventListener"];
		};

		vk.overlaysContent = true;
		vk.addEventListener("geometrychange", (event) => {
			const { x, y, height } = event.target.boundingRect;

			if (x === 0 && y < 100) {
				if (height > 100 && !keyboardShowEventEmitted) {
					document.documentElement.style.setProperty(
						"--vh",
						`calc(100% - ${height}px)`,
					);
					keyboardShowEventEmitted = true;
					keyboardHideEventEmitted = false;
					emitKeyboardEvent("show");
				} else if (height < 100 && !keyboardHideEventEmitted) {
					document.documentElement.style.removeProperty("--vh");
					keyboardHideEventEmitted = true;
					keyboardShowEventEmitted = false;
					emitKeyboardEvent("hide");
				}
			}
		});
	}

	if (!(await navigator.serviceWorker.getRegistration())) {
		await navigator.serviceWorker.register("/service-worker.js");
	}

	let manifestLink = document.querySelector(
		'link[rel="manifest"]',
	) as HTMLLinkElement;
	if (!manifestLink) {
		manifestLink = Object.assign(document.createElement("link"), {
			rel: "manifest",
			href: "/manifest.json",
		});
		document.head.appendChild(manifestLink);
	}

	manifestLink.href = `/manifest.json?v=${process.env.VERSION}`;

	if (navigator.storage?.persist) {
		document.body.dataset.message = "Requesting persistent storage...";
		const persistent = await navigator.storage.persist();
		if (persistent) {
			console.info(
				"Storage will not be cleared except by explicit user action",
			);
		} else {
			console.info("Storage may be cleared by the UA under storage pressure.");
		}
	}

	document.body.dataset.message = "Initializing scanner...";
	await scanner.init();
	document.body.dataset.message = "Initializing filesystem...";
	await file.init();

	const actionStack = await import("lib/actionStack");
	// Clear any stale hash from a previous session
	history.replaceState(
		null,
		"",
		window.location.pathname + window.location.search,
	);
	actionStack.default.on("push", (action) => {
		window.location.hash = action.id;
	});
	window.addEventListener("hashchange", () => {
		actionStack.default.pop();
	});

	// clear cache if size exceeds limit of 100MB
	let size = 0;
	const files = await opfs.list("/cache");
	for (const filePath of files) {
		const info = await opfs.stat(filePath);
		size += info.size;
	}
	if (size > MAX_CACHE_SIZE) {
		console.warn("Clearing cache, size exceeded limit");
		for (const filePath of files) {
			await opfs.delete(filePath);
		}
	}
}

function debounced<T extends unknown[]>(
	func: (...args: T) => void,
	delay: number,
) {
	let timeoutId: ReturnType<typeof setTimeout>;
	return (...args: T) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

function isBrowserServiceName(
	serviceName: string,
): serviceName is BrowserServiceName {
	return serviceName in services;
}
