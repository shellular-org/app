import opfs from "./lib/opfs";

const MIN_STORAGE_QUOTA = 50 * 1024 * 1024; // 50MB
const REQUIRED_WINDOW_APIS = ["caches"];
const REQUIRED_NAVIGATOR_APIS = ["storage", "permissions", "virtualKeyboard"];
const BROWSER_CHECK_STORAGE_KEY = "browser-check";

/**
 * Check if the browser is compatible with the app's requirements.
 * @param {boolean} isMobile - Whether the device is mobile or not.
 */
export default async function checkBrowser(isMobile: boolean) {
	if (localStorage.getItem(BROWSER_CHECK_STORAGE_KEY) === "true") {
		return;
	}

	document.body.dataset.message = "Checking browser compatibility...";
	try {
		for (const api of REQUIRED_WINDOW_APIS) {
			if (!(api in window)) {
				throw new Error(`${api} not supported`);
			}
		}

		for (const api of REQUIRED_NAVIGATOR_APIS) {
			if (!(api in navigator)) {
				if (api === "virtualKeyboard" && !isMobile) {
					continue;
				}

				throw new Error(`${api} not supported`);
			}
		}

		if (!navigator.storage.getDirectory) {
			throw new Error("File System Access API not supported");
		}

		await opfs.init();
		await opfs.writeFile(".test", new ArrayBuffer(1));
		const wStream = await opfs.createReadStream(".test");
		const rStream = await opfs.createReadStream(".test", { start: 0, end: 0 });
		wStream.destroy();
		rStream.destroy();
		await opfs.delete(".test");

		if (
			!navigator.storage.estimate ||
			((await navigator.storage.estimate()).quota ?? 0) < MIN_STORAGE_QUOTA
		) {
			throw new Error("Insufficient storage quota");
		}

		localStorage.setItem(BROWSER_CHECK_STORAGE_KEY, "true");
	} catch (error) {
		let compatibleBrowsers: string[] = [];

		if (isMobile) {
			compatibleBrowsers = ["Chrome for Android", "Samsung Internet"];
		} else {
			compatibleBrowsers = [
				"Google Chrome",
				"Microsoft Edge",
				"Mozilla Firefox",
				"Brave",
				"Opera",
			];
		}

		document.body.insertAdjacentHTML(
			"beforeend",
			`<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;color:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:20px;z-index:10000">
      <h1 style="margin-bottom:10px; font-weight: bold;"><span class='icon-warning danger'></span> Unsupported Browser</h1>
      <p style="max-width:400px;text-align:center;">Please use a compatible browser such as ${compatibleBrowsers.join(", ")} with latest updates.</p>
      </div>`,
		);
		throw error;
	}
}
