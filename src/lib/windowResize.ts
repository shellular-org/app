type ResizeEvent = "resize" | "resizeStart";
type ResizeEventListener = () => void;

let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

const event: Record<ResizeEvent, ResizeEventListener[]> = {
	resize: [],
	resizeStart: [],
};

/**
 * *external keyboard*
 * -> config.hardKeyboardHidden = HARDKEYBOARDHIDDEN_NO
 * This means that external keyboard is connected. If external keyboard is connected,
 * we don't need to do anything.
 *
 * *floating keyboard is active*
 * -> No way to detect this.
 *
 * *keyboard is hidden*
 * -> If window height is smaller than earlier, keyboard is visible. and vice versa.
 * If keyboard is not visible, we need to blur the editor, and hide the ad.
 * Else we need to focus the editor, and show the ad.
 */

export default function windowResize() {
	startResize();

	if (resizeTimeout) clearTimeout(resizeTimeout);
	resizeTimeout = setTimeout(onResize, 100);
}

function startResize() {
	if (document.body.classList.contains("resizing")) return;
	document.body.classList.add("resizing");
	emit("resizeStart");
}

windowResize.start = () => {
	if (resizeTimeout) clearTimeout(resizeTimeout);
	resizeTimeout = null;
	startResize();
};

windowResize.end = () => {
	if (resizeTimeout) clearTimeout(resizeTimeout);
	resizeTimeout = null;
	onResize();
};

/**
 * Add event listener for window done resizing.
 * @param {ResizeEvent} eventName
 * @param {Function} callback
 * @returns
 */
windowResize.on = (eventName: ResizeEvent, callback: ResizeEventListener) => {
	if (!event[eventName]) {
		return;
	}
	event[eventName].push(callback);
};

/**
 * Remove event listener for window done resizing.
 * @param {ResizeEvent} eventName
 * @param {Function} callback
 * @returns
 */
windowResize.off = (eventName: ResizeEvent, callback: ResizeEventListener) => {
	if (!event[eventName]) {
		return;
	}
	event[eventName] = event[eventName].filter((cb) => cb !== callback);
};

/**
 * Timeout function for window done resizing.
 */
function onResize() {
	resizeTimeout = null;
	if (!document.body.classList.contains("resizing")) return;
	emit("resize");
	document.body.classList.remove("resizing");
}

/**
 * Emit event
 * @param {ResizeEvent} eventName
 * @returns
 */
function emit(eventName: ResizeEvent) {
	if (!event[eventName]) {
		return;
	}

	for (const cb of Array.from(event[eventName])) {
		cb();
	}
}
