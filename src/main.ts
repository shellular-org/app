import "res/icons/style.css";
import "./index.html";
import "./main.scss";

import "res/favicon.ico";
import "res/splash.svg";

import "polyfill";

import device from "bridge/device";
import dialog from "bridge/dialog";
import file from "bridge/file";
import native from "bridge/native";
import scanner from "bridge/scanner";
import { initBrowserBridge } from "browser";
import { initProxyBridge } from "browser/proxy";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { setupSessionStateListeners } from "state/sessions";
import themes from "themes";
import App from "./App";
import actionStack from "./lib/actionStack";
import appConfig from "./lib/appConfig";
import { createBrowserAuthCallbackMessage } from "./lib/browserAuthCallback";
import { initSodium } from "./lib/e2ee";
import keyboard from "./lib/keyboard";
import { loadSettings } from "./lib/settings";
import * as store from "./lib/store";
import windowResize from "./lib/windowResize";
import externalLinks from "./listeners/externalLinks";
import intent from "./listeners/intent";

if (isBrowserAuthCallback()) {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", completeBrowserAuthCallback);
	} else {
		completeBrowserAuthCallback();
	}
} else if (document.readyState === "complete") {
	load().catch(console.error);
} else {
	window.addEventListener("load", load);
}

function isBrowserAuthCallback(): boolean {
	if (process.env.PLATFORM !== "browser") return false;
	try {
		const url = new URL(window.location.href);
		return url.searchParams.get("shellularAuthCallback") === "1";
	} catch {
		return false;
	}
}

function completeBrowserAuthCallback() {
	if (!document.body) return;
	document.body.classList.remove("loading");
	document.body.classList.add("done");
	document.body.textContent = "Completing sign-in...";

	const payload = createBrowserAuthCallbackMessage(window.location.href);
	if (!payload) {
		document.body.textContent =
			"Invalid sign-in callback. You can close this window.";
		return;
	}
	if (!window.opener) {
		document.body.textContent =
			"Sign-in window lost its parent. Please try again.";
		return;
	}
	window.opener.postMessage(payload, window.location.origin);
}

async function load() {
	if (process.env.PLATFORM === "ios") {
		// iOS has a weird quirk where the haptic engine can get stuck until it's triggered for the first time, so we trigger it on startup to ensure it works when needed later
		// Do not remove this call even if it seems redundant, as it has a significant impact on user experience for iOS users
		native.haptic();
	}
	native.hideSplashScreen();

	const appInfo = await native.getAppInfo();
	const bootMessage = `App Version: ${appInfo.versionName} (${appInfo.versionCode})`;

	// Ensure storage directories exist before any file-backed operations
	if (!(await file.exists(appConfig.DATA_DIR))) {
		await file.createDirectory(appConfig.DATA_DIR);
	}

	if (!(await file.exists(appConfig.CACHE_DIR))) {
		await file.createDirectory(appConfig.CACHE_DIR);
	}

	await initSodium();

	const MIGRATE_KEYS = ["shellular:client-id", "uid_t"];
	for (const key of MIGRATE_KEYS) {
		const lsValue = localStorage.getItem(key);
		if (lsValue !== null && (await store.get(key)) === null) {
			await store.set(key, lsValue);
			localStorage.removeItem(key);
		}
	}

	const settings = await loadSettings();
	await themes.applyTheme(settings.theme);

	if (process.env.PLATFORM === "android") {
		const navMode = await native.getNavigationMode();
		const root = document.documentElement.style;
		root.setProperty("--sat", `${navMode.statusBarHeight}px`);
		if (navMode.hasButtons) {
			root.setProperty("--sab", `${navMode.navigationBarHeight}px`);
		}
	}

	if (!(await store.get<string>("uid_t"))) {
		const deviceId = await device.id();
		await store.set(
			"uid_t",
			`${deviceId}-${process.env.PLATFORM}/${appInfo.platform || "android"}/${appInfo.arch || "arm"}`,
		);
	}

	try {
		native.haptic();
	} catch {}

	scanner.hide();
	document.body.classList.add("icon-empty");
	document.body.dataset.message = bootMessage;
	document.body.classList.remove("icon-empty");
	document.body.setAttribute("platform", process.env.PLATFORM);
	document.addEventListener("backbutton", actionStack.pop);
	window.addEventListener("resize", windowResize);
	keyboard.on("show", whenKeyboardShow);
	keyboard.on("hide", whenKeyboardHide);
	document.addEventListener("click", externalLinks);
	native.setIntentHandler(intent, console.error);

	document.body.classList.remove("loading");
	document.body.classList.add("done");
	initBrowserBridge();
	initProxyBridge();
	setupSessionStateListeners();
	createRoot(document.body).render(createElement(App));

	try {
		const json = await fetch("https://shellular.dev/app-version.json").then(
			(res) => res.json(),
		);
		const platform = json[process.env.PLATFORM];
		if (!platform) {
			return;
		}

		const versionCode = Number.parseInt(platform.versionCode, 10);
		if (versionCode > Number.parseInt(process.env.VERSION_CODE, 10)) {
			const confirmation = await dialog.confirm(
				`New version ${platform.version} available on ${process.env.IS_IOS ? "App Store" : "Play Store"}, update?`,
				"New version available",
			);

			if (confirmation) {
				native.openInBrowser(platform.storeUrl);
			}
		}
	} catch {}
}

/**
 * Handles when keyboard is about to show
 */
function whenKeyboardShow() {
	document.body.classList.add("keyboard-visible");
}

/**
 * Handles when keyboard is about to hide
 */
function whenKeyboardHide() {
	document.body.classList.remove("keyboard-visible");
}
