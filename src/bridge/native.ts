import type Theme from "classes/theme";
import permissions from "lib/permissions";
import {
	DESKTOP_COMMAND_IDS,
	type DesktopKeyboardCommand,
	type ShortcutModifier,
} from "workbench/desktopShortcuts";
import bridge from "./bridge";

export type AppInfo = {
	firstInstallTime: string;
	lastUpdateTime: number;
	versionName: string;
	versionCode: string;
	packageName: string;
	label: string;
	arch?: string;
	platform?: string;
};

export type DeviceInfo = {
	manufacturer: string;
	model: string;
	isEmulator: boolean;
};

export type Intent = {
	action: string;
	extras: Record<string, string>;
};

export type NavigationMode = {
	mode: number;
	hasButtons: boolean;
	navigationBarHeight: number;
	statusBarHeight: number;
};

export type DesktopCommand = DesktopKeyboardCommand;

export type DesktopCapabilities = {
	localWorkspace: boolean;
	canPickLocalFiles: boolean;
	canRevealLocalPath: boolean;
	canOpenSystemTerminal: boolean;
};

export type DesktopNativeShortcut = {
	key: string;
	modifiers: ShortcutModifier[];
};

export type DesktopShortcutContext = {
	contextualNew: "new-chat" | "new-file";
	shortcuts?: Partial<Record<DesktopCommand, DesktopNativeShortcut | null>>;
};

const native = bridge("Native");
let desktopCommandRegistration = 0;

export default {
	exitApp(): Promise<void> {
		return native("exitApp") as Promise<void>;
	},
	getVersionSdkInt(): Promise<number> {
		return native("getVersionSdkInt") as Promise<number>;
	},
	shareFile(fileUri: string, filename = "", packageName = ""): Promise<void> {
		return native("shareFile", [
			fileUri,
			filename,
			packageName,
		]) as Promise<void>;
	},
	shareText(text: string, address = ""): Promise<void> {
		return native("shareText", [text, address]) as Promise<void>;
	},
	getAppInfo(): Promise<AppInfo> {
		return native("getAppInfo") as Promise<AppInfo>;
	},
	getDeviceInfo(): Promise<DeviceInfo> {
		return native("getDeviceInfo") as Promise<DeviceInfo>;
	},
	requestPermission(permission: string): Promise<boolean> {
		return native("requestPermission", [permission]) as Promise<boolean>;
	},
	requestPermissions(...permissions: string[]): Promise<boolean[]> {
		return native("requestPermissions", [permissions]) as Promise<boolean[]>;
	},
	hasPermission(permission: string): Promise<boolean> {
		return native("hasPermission", [permission]) as Promise<boolean>;
	},
	openInBrowser(src: string): Promise<void> {
		return native("openInBrowser", [src]) as Promise<void>;
	},
	setIntentHandler(handler: (e: Intent) => void, onerror: (e: Error) => void) {
		Bridge.exec(
			(data) => handler(data as Intent),
			onerror,
			"Native",
			"setIntentHandler",
			[],
		);
	},
	setDesktopCommandHandler(
		handler: (command: DesktopCommand) => void,
		onerror: (e: Error) => void = console.error,
	) {
		desktopCommandRegistration += 1;
		const registrationId = `desktop-command-${desktopCommandRegistration}`;
		let active = true;
		Bridge.exec(
			(data) => {
				if (active && isDesktopCommand(data)) handler(data);
			},
			onerror,
			"Native",
			"setDesktopCommandHandler",
			[registrationId],
		);
		return () => {
			if (!active) return;
			active = false;
			void native("clearDesktopCommandHandler", [registrationId]).catch(
				onerror,
			);
		};
	},
	getDesktopCapabilities(): Promise<DesktopCapabilities> {
		return native("getDesktopCapabilities") as Promise<DesktopCapabilities>;
	},
	pickLocalFiles(rootPath?: string): Promise<string[]> {
		return native("pickLocalFiles", rootPath ? [rootPath] : []) as Promise<
			string[]
		>;
	},
	pickLocalDirectory(rootPath: string): Promise<string | null> {
		return native("pickLocalDirectory", [rootPath]) as Promise<string | null>;
	},
	revealLocalPath(path: string): Promise<void> {
		return native("revealLocalPath", [path]) as Promise<void>;
	},
	openSystemTerminal(path: string): Promise<void> {
		return native("openSystemTerminal", [path]) as Promise<void>;
	},
	setWindowTitle(title: string): Promise<void> {
		return native("setWindowTitle", [title]) as Promise<void>;
	},
	setDesktopShortcutContext(context: DesktopShortcutContext): Promise<void> {
		return native("setDesktopShortcutContext", [context]) as Promise<void>;
	},
	loadBundledAsset(path: string): Promise<string> {
		return native("loadBundledAsset", [path]) as Promise<string>;
	},
	readClipboardText(): Promise<string> {
		return native("readClipboardText") as Promise<string>;
	},
	writeClipboardText(text: string): Promise<void> {
		return native("writeClipboardText", [text]) as Promise<void>;
	},
	async setTheme(theme: Theme) {
		const themeStyle = document.querySelector("style#theme-data");
		if (themeStyle) {
			themeStyle.textContent = theme.css as string;
		}
		return native("setTheme", [theme.json]);
	},
	setSystemBarColor(color?: string) {
		return native("setSystemBarColor", color ? [color] : []);
	},
	async captureFromCamera() {
		if (!(await this.requestPermission(permissions.CAMERA))) {
			console.warn("Camera permission not granted");
			return null;
		}
		return native("captureFromCamera");
	},
	async getIpAddresses(): Promise<string[]> {
		if (!(await this.requestPermission(permissions.NET_STATE))) {
			console.warn("Network state permission not granted");
			return [];
		}
		return native("getIpAddresses") as Promise<string[]>;
	},
	restartApp() {
		return native("restartApp");
	},
	requestIgnoreBatteryOptimization() {
		return native("requestIgnoreBatteryOptimization");
	},
	toast(msg: string) {
		return native("showToast", [msg]);
	},
	hideSplashScreen(): Promise<void> {
		return native("hideSplashScreen") as Promise<void>;
	},
	getNavigationMode(): Promise<NavigationMode> {
		return native("getNavigationMode") as Promise<NavigationMode>;
	},
	haptic(): Promise<void> {
		return native("haptic") as Promise<void>;
	},
	setKeyboardSuggestionsEnabled(enabled: boolean): Promise<void> {
		return native("setKeyboardSuggestionsEnabled", [enabled]) as Promise<void>;
	},
};

function isDesktopCommand(value: unknown): value is DesktopCommand {
	return (
		typeof value === "string" &&
		(DESKTOP_COMMAND_IDS as string[]).includes(value)
	);
}
