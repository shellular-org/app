//# allFunctionsCalledOnLoad

import { initHapticDelegation } from "lib/haptics";

(async () => {
	delete (window as unknown as { SharedWorker?: unknown }).SharedWorker;

	console.info(`App Version: ${process.env.VERSION}`);
	if (
		process.env.DEV_MODE &&
		process.env.ORIGIN &&
		process.env.ORIGIN !== location.origin &&
		!process.env.IS_BROWSER
	) {
		try {
			await fetch(process.env.ORIGIN, {
				method: "HEAD",
				mode: "no-cors",
				signal: AbortSignal.timeout(3000),
				headers: {
					"Content-Type": "text/html",
				},
			});
			window.location.replace(process.env.ORIGIN);
			return;
		} catch (error) {
			console.error("Error setting dev mode", error);
		}
	}

	if (process.env.DEV_MODE) {
		const eruda = await import("./console");
		eruda.default.init();
	}

	// Initialize haptic feedback delegation
	initHapticDelegation();

	let setup: { default: () => Promise<void> } | null = null;

	if (process.env.IS_ANDROID) {
		setup = await import("./platforms/android");
	} else if (process.env.IS_IOS) {
		setup = await import("./platforms/ios");
	} else if (process.env.IS_BROWSER) {
		setup = await import("./platforms/browser");
	}

	try {
		if (!setup) {
			throw new Error("No platform setup module matched this environment");
		}
		await setup.default();
	} catch (error) {
		console.error("Error during platform setup:", error);
	}

	import("./main");
})();
