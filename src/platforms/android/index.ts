import "core-js/stable";

const callbacks = new Map();
let callbackIdCounter = 0;

window.Bridge = {
	/**
	 * Calls a native service's action with the given arguments.
	 *
	 * @param success - The callback to be called when the action
	 *     completes successfully.
	 * @param error - The callback to be called when the action
	 *     completes with an error.
	 * @param service - The name of the native service to call.
	 * @param action - The name of the action to call.
	 * @param args - The arguments to pass to the action.
	 */
	exec(
		success: (data: unknown) => void,
		error: (error: Error) => void,
		service: string,
		action: string,
		args: unknown[],
	) {
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
		} catch (error) {
			console.error("Failed to serialize arguments", error);
			throw new Error("Failed to serialize arguments");
		}

		Android.exec(service, action, execArgs, id);
		callbacks.set(id, { success, error });
	},
};

Android.callback = ({ id, keep, success, error, length, isBinary }) => {
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
};

export default async function setup() {
	const root = document.documentElement;

	function setVh(height: number) {
		root.style.setProperty("--vh", `${height}px`);
	}

	setVh(window.innerHeight);
	root.style.setProperty("--tabbar-h", `calc(96px + var(--sab, 0px))`);

	window.addEventListener("keyboardshow", (e) => {
		const height = (e as CustomEvent<{ height: number }>).detail.height;
		setVh(window.innerHeight - height);
		root.style.setProperty("--tabbar-h", "0px");
	});

	window.addEventListener("keyboardhide", () => {
		setVh(window.innerHeight);
		root.style.setProperty("--tabbar-h", `calc(96px + var(--sab, 0px))`);
	});

	window.addEventListener("resize", () => {
		setVh(window.innerHeight);
	});
}
