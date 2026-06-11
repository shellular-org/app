export default {
	async id(callback: Callback) {
		callback.success(await getDeviceId());
	},
};

type FingerprintValue =
	| string
	| number
	| boolean
	| null
	| FingerprintValue[]
	| { [key: string]: FingerprintValue };

async function getDeviceId() {
	// Common browser metrics with feature detection
	const browserMetrics = {
		userAgent: navigator.userAgent ?? "",
		language: navigator.language ?? "",
		languages: navigator.languages ?? [],
		hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
		maxTouchPoints: navigator.maxTouchPoints ?? 0,
		deviceMemory:
			(navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0,
		screen: {
			width: window.screen.width,
			height: window.screen.height,
			colorDepth: window.screen.colorDepth,
			pixelDepth: window.screen.pixelDepth || window.screen.colorDepth,
		},
		timezone: getTimezone(),
		fonts: await getFonts(),
		webgl: getWebGLInfo(),
		plugins: getPluginDetails(),
		canvas: getCanvasFingerprint(),
		audio: await getAudioFingerprint(),
	};

	// Merge with native data and filter empty values
	const allMetrics = Object.entries({
		...browserMetrics,
	}).reduce<Record<string, FingerprintValue>>((acc, [key, value]) => {
		if (value !== undefined && value !== "") {
			acc[key] = value as FingerprintValue;
		}
		return acc;
	}, {});

	return hashObject(normalizeData(allMetrics));

	// Helper functions
	function getTimezone() {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			const offset = new Date().getTimezoneOffset();
			return `UTC${offset > 0 ? "-" : "+"}${Math.abs(offset) / 60}`;
		}
	}

	async function getFonts() {
		try {
			const fontSet = new Set([
				"Arial",
				"Times New Roman",
				"Verdana",
				"Courier New",
				"Comic Sans MS",
				"Helvetica",
				"Georgia",
				"Lucida Console",
			]);

			await document.fonts.ready;
			return [...document.fonts]
				.map((font) => font.family)
				.filter((family) => fontSet.has(family))
				.sort();
		} catch {
			return getBasicFonts();
		}
	}

	function getBasicFonts() {
		const testString = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		const testEl = document.createElement("div");
		testEl.style.position = "absolute";
		testEl.style.left = "-9999px";
		testEl.textContent = testString;

		document.body.appendChild(testEl);

		const fonts = [
			"Arial",
			"Arial Black",
			"Courier New",
			"Comic Sans MS",
			"Georgia",
			"Impact",
			"Times New Roman",
			"Trebuchet MS",
			"Verdana",
			"Webdings",
			"MS Sans Serif",
			"Lucida Console",
		];

		const available = fonts.filter((font) => {
			testEl.style.fontFamily = `monospace, ${font}`;
			const originalWidth = testEl.offsetWidth;
			testEl.style.fontFamily = `monospace, ${font}!important`;
			return testEl.offsetWidth !== originalWidth;
		});

		document.body.removeChild(testEl);
		return available.sort();
	}

	function getWebGLInfo() {
		try {
			const canvas = document.createElement("canvas");
			const gl: WebGLRenderingContext | null = (canvas.getContext("webgl") ||
				canvas.getContext(
					"experimental-webgl",
				)) as WebGLRenderingContext | null;
			if (!gl) {
				return null;
			}

			type DebugInfo = {
				getParameter: (p: number) => unknown;
				UNMASKED_VENDOR_WEBGL: number;
				UNMASKED_RENDERER_WEBGL: number;
			};

			const debugInfo: DebugInfo | null = gl.getExtension(
				"WEBGL_debug_renderer_info",
			) as DebugInfo;
			return {
				vendor: gl.getParameter(gl.VENDOR),
				renderer: gl.getParameter(gl.RENDERER),
				unmaskedVendor: debugInfo?.getParameter(
					debugInfo.UNMASKED_VENDOR_WEBGL,
				),
				unmaskedRenderer: debugInfo?.getParameter(
					debugInfo.UNMASKED_RENDERER_WEBGL,
				),
			};
		} catch {
			return null;
		}
	}

	function getPluginDetails() {
		return [...(navigator.plugins || [])]
			.map((plugin) => plugin.name)
			.sort()
			.join(",");
	}

	function getCanvasFingerprint() {
		try {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");
			if (!ctx) return "";
			ctx.textBaseline = "top";
			ctx.font = "14px Arial";
			ctx.fillStyle = "#f60";
			ctx.fillRect(0, 0, 122, 30);
			ctx.fillStyle = "#069";
			ctx.fillText("<canvas>", 2, 15);
			return canvas.toDataURL();
		} catch {
			return "";
		}
	}

	async function getAudioFingerprint() {
		try {
			const context = new (window.AudioContext || window.webkitAudioContext)();
			const oscillator = context.createOscillator();
			const analyser = context.createAnalyser();

			oscillator.connect(analyser);
			oscillator.start();

			await new Promise((resolve) => {
				setTimeout(resolve, 100);
			});

			const fft = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteFrequencyData(fft);

			oscillator.stop();
			context.close();

			return Array.from(fft);
		} catch {
			return [];
		}
	}

	function normalizeData(obj: FingerprintValue): FingerprintValue {
		if (Array.isArray(obj)) {
			return obj.map(normalizeData).sort();
		}

		if (obj && typeof obj === "object") {
			return Object.keys(obj)
				.sort()
				.reduce<Record<string, FingerprintValue>>((acc, key) => {
					acc[key] = normalizeData(obj[key]);
					return acc;
				}, {});
		}

		return typeof obj === "number" ? obj.toString() : obj;
	}

	async function hashObject(obj: FingerprintValue): Promise<string> {
		const jsonString = JSON.stringify(obj);
		try {
			const hash = await crypto.subtle.digest(
				"SHA-1",
				new TextEncoder().encode(jsonString),
			);
			const hex = Array.from(new Uint8Array(hash))
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			return `dev_${hex}`;
		} catch {
			// Fallback for browsers without crypto.subtle
			let hash = 0;
			for (let i = 0; i < jsonString.length; i++) {
				const char = jsonString.charCodeAt(i);
				hash = (hash << 5) - hash + char;
				hash |= 0;
			}
			return `dev_${Math.abs(hash).toString(16)}`;
		}
	}
}
