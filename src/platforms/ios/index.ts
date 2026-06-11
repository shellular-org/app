import "core-js/stable";
import proxy from "./proxy";

const callbacks = new Map();
let callbackIdCounter = 0;

window.Bridge = {
	exec(success, error, service, action, args) {
		const id = ++callbackIdCounter;
		let execArgs: string;

		try {
			args = args.map((arg) => {
				if (arg instanceof ArrayBuffer) {
					const base64 = window.btoa(
						new Uint8Array(arg).reduce(
							(data, byte) => data + String.fromCharCode(byte),
							"",
						),
					);
					return base64;
				}
				return arg;
			});
			execArgs = JSON.stringify(args);
		} catch (err) {
			console.error("Failed to serialize arguments", err);
			throw new Error("Failed to serialize arguments");
		}

		if (service in proxy) {
			const serviceKey = service as keyof typeof proxy;
			const serviceProxy = proxy[serviceKey] as Record<
				string,
				(...args: unknown[]) => unknown
			>;
			if (action in serviceProxy) {
				serviceProxy[action](success, error, execArgs);
				return;
			}
		}
		window.webkit.messageHandlers.exec.postMessage({
			service,
			action,
			args: execArgs,
			id,
		});
		callbacks.set(id, { success, error });
	},
};

window.iOS = {
	callback({ id, keep, success, error, isBinary, length }) {
		if (!callbacks.has(id)) {
			return;
		}

		const callback = callbacks.get(id);

		if (!keep) {
			callbacks.delete(id);
		}

		if (isBinary) {
			if (length) {
				const uint8Array = new Uint8Array(length);
				for (let i = 0; i < length; i++) {
					uint8Array[i] = (success as string).charCodeAt(i);
				}
				success = uint8Array;
			}
		}

		if (error) {
			callback.error?.(error);
		} else {
			callback.success?.(success);
		}
	},
};

export default async function setup() {
	const root = document.documentElement;

	function setVh(height: number) {
		root.style.setProperty("--vh", `${height}px`);
	}

	setVh(window.innerHeight);
	root.style.setProperty("--tabbar-h", "96px");

	window.addEventListener("keyboardshow", (e) => {
		const height = (e as CustomEvent<{ height: number }>).detail.height;
		setVh(window.innerHeight - height);
		root.style.setProperty("--tabbar-h", "0px");
		requestAnimationFrame(() => window.scrollTo(0, 0));
	});

	window.addEventListener("keyboardhide", () => {
		setVh(window.innerHeight);
		root.style.setProperty("--tabbar-h", "96px");
	});

	window.addEventListener("resize", () => {
		setVh(window.innerHeight);
	});
}
