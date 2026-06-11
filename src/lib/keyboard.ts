type KeyboardEvent = "show" | "hide";
type KeyboardEventListener = () => void;

const event: Record<KeyboardEvent, KeyboardEventListener[]> = {
	show: [],
	hide: [],
};

let keyboardHeight = 0;

document.documentElement.style.setProperty("--keyboard-height", "0px");

window.addEventListener("keyboardshow", ((e: CustomEvent) => {
	if (e.detail?.height) {
		keyboardHeight = e.detail.height;
		document.documentElement.style.setProperty(
			"--keyboard-height",
			`${keyboardHeight}px`,
		);
	}
	emit("show");

	const { activeElement } = document;

	if (activeElement instanceof HTMLInputElement) {
		requestAnimationFrame(() => {
			activeElement.scrollIntoView({ behavior: "smooth" });
		});
	}
}) as EventListener);

window.addEventListener("keyboardhide", (() => {
	document.documentElement.style.setProperty("--keyboard-height", "0px");
	emit("hide");
}) as EventListener);

export default {
	/**
	 * Add event listener for keyboard event.
	 */
	on(eventName: KeyboardEvent, callback: KeyboardEventListener) {
		if (!event[eventName]) {
			return;
		}
		event[eventName].push(callback);
	},
	/**
	 * Remove event listener for keyboard event.
	 */
	off(eventName: KeyboardEvent, callback: KeyboardEventListener) {
		if (!event[eventName]) {
			return;
		}
		event[eventName] = Array.from(event[eventName]).filter(
			(cb) => cb !== callback,
		);
	},
	/**
	 * Emit keyboard event.
	 */
	emit(eventName: KeyboardEvent) {
		emit(eventName);
	},
	/**
	 * Add event listener for keyboard event that will be called only once.
	 */
	once(eventName: KeyboardEvent, callback: KeyboardEventListener) {
		if (!event[eventName]) {
			return;
		}
		const wrapper = () => {
			callback();
			this.off(eventName, wrapper);
		};
		this.on(eventName, wrapper);
	},
};

/**
 * Emit keyboard event.
 */
function emit(eventName: KeyboardEvent) {
	if (!event[eventName]) {
		return;
	}
	for (const cb of Array.from(event[eventName])) {
		cb();
	}
}
