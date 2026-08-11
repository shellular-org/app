import type Theme from "classes/theme";
import permissions from "lib/permissions";
import toast from "lib/toast";

let cameraPermissionGranted = false;
let appTheme: Theme | null = null;
let intentHandler: Callback | null = null;
let desktopCommandHandler: { id: string; callback: Callback } | null = null;

type Intent = {
	action: string;
	[key: string]: string;
};

window.addEventListener("focus", () => {
	const intents: Intent[] = JSON.parse(
		localStorage.getItem("intent-actions") || "[]",
	);
	if (Array.isArray(intents) && intents.length && intentHandler) {
		for (const intent of intents) {
			let uri = `foxbiz://${intent.action}`;
			const data = [];

			for (const [key, value] of Object.entries(intent)) {
				if (key === "action") continue;
				data.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
			}

			if (data.length) {
				uri += `?${data.join("&")}`;
			}

			intentHandler.keep = true;
			intentHandler.success({ uri });
		}
	}
	localStorage.setItem("intent-actions", "[]");
});

export default {
	exitApp() {
		window.location.href = "about:blank";
	},
	getAppInfo(callback: Callback) {
		const arch =
			(navigator as Navigator & { userAgentData?: { architecture?: string } })
				.userAgentData?.architecture || "";
		const userAgent = navigator.userAgent || "";
		let platform = "Unknown";

		if (/Windows/i.test(userAgent)) {
			platform = "win32";
		} else if (/Macintosh|MacIntel|MacPPC|Mac68K/i.test(userAgent)) {
			platform = "darwin";
		} else if (/Linux/i.test(userAgent)) {
			platform = "linux";
		} else if (/Android/i.test(userAgent)) {
			platform = "android";
		} else if (/iPhone|iPad|iPod/i.test(userAgent)) {
			platform = "ios";
		}

		callback.success({
			arch,
			platform,
			lastUpdateTime: 0,
			firstInstallTime: 0,
			label: process.env.DISPLAY_NAME,
			packageName: process.env.ID,
			versionName: process.env.VERSION,
			versionCode: process.env.VERSION_CODE,
		});
	},
	getDeviceInfo(callback: Callback) {
		const userAgent = navigator.userAgent || "";
		const isEmulator = /(emulator|simulator|android sdk built for x86)/i.test(
			userAgent,
		);
		callback.success({
			manufacturer: navigator.vendor,
			model: navigator.platform,
			product: navigator.product,
			isEmulator,
		});
	},
	shareFile(callback: Callback) {
		callback.success();
	},
	async requestPermission(callback: Callback, [permission]: [string]) {
		try {
			await requestPermission(permission);
			callback.success();
		} catch (error) {
			callback.error(errorMessage(error));
		}
	},
	async requestPermissions(callback: Callback, [permissionsList]: [string[]]) {
		if (!Array.isArray(permissionsList)) {
			callback.error("Invalid permissions list");
			return;
		}

		for (const permission of permissionsList) {
			await requestPermission(permission);
		}
		callback.success();
	},
	async hasPermission(callback: Callback, [permission]: [string]) {
		try {
			switch (permission) {
				case permissions.CAMERA: {
					const isMobile = /Android/i.test(navigator.userAgent);
					if (!isMobile) {
						callback.success(true);
						return;
					}
					callback.success(cameraPermissionGranted);
					break;
				}
				case permissions.NOTIFICATION: {
					callback.success(Notification.permission === "granted");
					break;
				}
				default:
					callback.success(true);
					break;
			}
		} catch (error) {
			console.error(error);
		}
	},
	setIntentHandler(callback: Callback) {
		intentHandler = callback;
	},
	setDesktopCommandHandler(callback: Callback, [id]: [string]) {
		if (desktopCommandHandler) {
			desktopCommandHandler.callback.keep = false;
			desktopCommandHandler.callback.success(null);
		}
		callback.keep = true;
		desktopCommandHandler = { id, callback };
	},
	clearDesktopCommandHandler(callback: Callback, [id]: [string]) {
		if (desktopCommandHandler?.id === id) {
			desktopCommandHandler.callback.keep = false;
			desktopCommandHandler.callback.success(null);
			desktopCommandHandler = null;
		}
		callback.success();
	},
	getDesktopCapabilities(callback: Callback) {
		callback.success({
			localWorkspace: false,
			canPickLocalFiles: false,
			canRevealLocalPath: false,
			canOpenSystemTerminal: false,
		});
	},
	pickLocalFiles(callback: Callback) {
		callback.success([]);
	},
	revealLocalPath(callback: Callback) {
		callback.error("Native file explorer is unavailable");
	},
	openSystemTerminal(callback: Callback) {
		callback.error("System terminal is unavailable");
	},
	setWindowTitle(callback: Callback, [title]: [string]) {
		document.title = title;
		callback.success();
	},
	setDesktopShortcutContext(callback: Callback) {
		callback.success();
	},
	getVersionSdkInt(callback: Callback) {
		callback.success(0);
	},
	openInBrowser(_callback: Callback, [src]: [string]) {
		window.open(src, "_blank");
	},
	setTheme(callback: Callback, [theme]: [Theme]) {
		appTheme = theme;
		setSystemBarColor(theme?.primary);
		callback.success();
	},
	setSystemBarColor(callback: Callback, [color]: [string]) {
		setSystemBarColor(color);
		callback.success();
	},
	async captureFromCamera(callback: Callback) {
		const image = Object.assign(document.createElement("input"), {
			type: "file",
			accept: "image/*",
			capture: "environment",
		}) as HTMLInputElement;
		image.style.display = "none";
		image.onchange = () => {
			if (image.files?.length) {
				const file = image.files[0];
				const reader = new FileReader();
				reader.onload = () => {
					callback.success(reader.result);
				};
				reader.readAsDataURL(file);
			}
		};
		image.click();
	},
	getIpAddresses(callback: Callback) {
		callback.success([]);
	},
	restartApp(callback: Callback) {
		window.location.reload();
		callback.success();
	},
	getConfiguration(callback: Callback) {
		callback.success({});
	},
	getLocation(callback: Callback) {
		callback.success();
	},
	requestIgnoreBatteryOptimization(callback: Callback) {
		callback.success();
	},
	startSocketService(callback: Callback) {
		callback.success();
	},
	stopSocketService(callback: Callback) {
		callback.success();
	},
	hideSplashScreen() {
		// do nothing as splash screen is not implemented
	},
	haptic(callback: Callback) {
		if (navigator.vibrate) {
			navigator.vibrate(10);
		}
		callback.success();
	},
	showToast(callback: Callback, [msg]: [string]) {
		toast(msg);
		callback.success();
	},
};

function setSystemBarColor(color: string) {
	let themeColor = document.querySelector(
		"meta[name='theme-color']",
	) as HTMLMetaElement;
	if (!themeColor) {
		themeColor = Object.assign(document.createElement("meta"), {
			name: "theme-color",
		});
	}
	themeColor.content = color || appTheme?.primary || "#ffffff";
	document.head.appendChild(themeColor);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function requestPermission(permission: string) {
	switch (permission) {
		case permissions.CAMERA: {
			const media = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: false,
			});
			for (const track of media.getTracks()) {
				track.stop();
			}
			cameraPermissionGranted = true;
			break;
		}
		case permissions.NOTIFICATION: {
			await Notification.requestPermission();
			break;
		}
		default:
			break;
	}
}
