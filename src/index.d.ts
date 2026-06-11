type PLATFORM = "android" | "browser" | "ios";

interface Bridge {
	exec(
		successCallback: (data: unknown) => void,
		errorCallback: (error: Error) => void,
		module: string,
		action: string,
		args: unknown[],
	): void;
}

declare namespace NodeJS {
	interface Process {
		env: {
			ID: string;
			IS_IOS: boolean;
			IS_ANDROID: boolean;
			IS_BROWSER: boolean;
			DEV_MODE: boolean;
			PLATFORM: PLATFORM;
			VERSION: string;
			VERSION_CODE: string;
			DISPLAY_NAME: string;
			HOST?: string;
			PORT?: string;
			ORIGIN?: string;
		};
	}
}

interface Window {
	iOS: iOSBridge;
	Android: AndroidBridge;
	Bridge: Bridge;
	webkitAudioContext?: typeof AudioContext;
	Buffer?: typeof import("buffer").Buffer;
	webkit: {
		messageHandlers: {
			exec: {
				postMessage(data: object): void;
			};
		};
	};
}

declare interface Callback {
	success: (data?: unknown) => void;
	error: (error: string) => void;
	keep?: boolean;
}

declare const process: NodeJS.Process;
declare const Bridge: Bridge;
declare const iOS: iOSBridge;
declare const Android: AndroidBridge;

// ---- Window extensions ----
interface AndroidBridge {
	exec(service: string, action: string, args: string, id: number): void;
	callback(data: {
		id: number;
		keep?: boolean;
		success?: unknown;
		error?: unknown;
		length?: number;
		isBinary?: boolean;
	}): void;
}

interface WebKitMessageHandlers {
	exec: { postMessage(data: object): void };
}

interface iOSBridge {
	callback(data: {
		id: number;
		keep?: boolean;
		success?: unknown;
		error?: unknown;
		isBinary?: boolean;
		length?: number;
	}): void;
}

interface VirtualKeyboard extends EventTarget {
	overlaysContent: boolean;
	boundingRect: DOMRect;
	addEventListener(
		type: "geometrychange",
		listener: (
			this: VirtualKeyboard,
			ev: Event & { target: VirtualKeyboard },
		) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
}

interface NavigatorWithExtensions extends Navigator {
	deviceMemory?: number;
	userAgentData?: {
		architecture?: string;
		platform?: string;
		brands?: { brand: string; version: string }[];
	};
	virtualKeyboard?: VirtualKeyboard;
}

declare var navigator: NavigatorWithExtensions;

interface WindowWithExtensions extends Window {
	Bridge: Bridge;
	Android: AndroidBridge;
	webkit: { messageHandlers: WebKitMessageHandlers };
	iOS: iOSBridge;
	webkitAudioContext?: typeof AudioContext;
	Buffer?: typeof import("buffer").Buffer;
}

declare var window: WindowWithExtensions;

// BarcodeDetector (experimental)
declare class BarcodeDetector {
	constructor(options?: { formats?: string[] });
	static getSupportedFormats(): Promise<string[]>;
	detect(image: ImageBitmapSource): Promise<
		Array<{
			rawValue: string;
			format: string;
			boundingBox: DOMRectReadOnly;
			cornerPoints: DOMPointReadOnly[];
		}>
	>;
}

declare module "jsqr" {
	export default function jsQR(
		data: Uint8ClampedArray,
		width: number,
		height: number,
	): { data: string } | null;
}

declare module "clsx" {
	type ClassValue =
		| string
		| number
		| ClassDictionary
		| ClassArray
		| undefined
		| null
		| boolean;

	interface ClassDictionary {
		[id: string]: unknown;
	}

	interface ClassArray extends Array<ClassValue> {}

	type ClassNamesFn = (...classes: ClassValue[]) => string;

	type ClassNamesExport = ClassNamesFn & { default: ClassNamesFn };

	const classNames: ClassNamesExport;

	export = classNames;
}

// Asset module declarations
declare module "*.ttf" {
	const src: string;
	export default src;
}
declare module "*.woff" {
	const src: string;
	export default src;
}
declare module "*.woff2" {
	const src: string;
	export default src;
}
declare module "*.svg" {
	const src: string;
	export default src;
}
declare module "*.png" {
	const src: string;
	export default src;
}
declare module "*.ico" {
	const src: string;
	export default src;
}
declare module "*.sql" {
	const src: string;
	export default src;
}
declare module "*.css" {
	const content: string;
	export default content;
}
declare module "*.scss" {
	const styles: Record<string, string>;
	export default styles;
}
declare module "*.html" {
	const content: string;
	export default content;
}
