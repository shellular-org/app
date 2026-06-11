import type { Intent } from "bridge/native";
import IntentEvent from "classes/intentEvent";

type IntentEventName =
	| "socket-service"
	| "subscription"
	| "oauth"
	| "auth-callback";
type IntentEventListener = (event: IntentEvent) => void;

const events: Record<IntentEventName, IntentEventListener[]> = {
	"socket-service": [],
	subscription: [],
	oauth: [],
	"auth-callback": [],
};

/**
 * Handles the intent event
 */
export default function intent(data: Intent) {
	if (data?.action === "socket-service") {
		emit("socket-service", data.extras.data);
		return;
	}
	if (data?.action === "auth-callback") {
		emit("auth-callback", data.extras);
		return;
	}
}

intent.on = addEventListener;
intent.off = removeEventListener;
/**
 * Adds an event listener for the specified event.
 */
intent.once = (event: IntentEventName, callback: IntentEventListener) => {
	const cb = (data: IntentEvent) => {
		callback(data);
		removeEventListener(event, cb);
	};
	addEventListener(event, cb);
};

/**
 * Emits an event to all registered listeners with the provided data.
 */
function emit(event: IntentEventName, data: string | Record<string, unknown>) {
	if (!events[event]) return;

	for (const callback of Array.from(events[event])) {
		const eventData = new IntentEvent(event, {
			data,
		});

		callback(eventData);

		if (eventData.defaultPrevented) {
			break;
		}
	}
}

/**
 * Adds an event listener for the specified event.
 * @param {keyof typeof events} event
 * @param {(event: IntentEvent) => void} callback
 */
function addEventListener(
	event: IntentEventName,
	callback: IntentEventListener,
) {
	events[event].push(callback);
}

/**
 * Removes a specific callback function from the list of event listeners for a given event.
 *
 * @param {string} event - The name of the event from which the listener should be removed.
 * @param {(event: IntentEvent) => void} callback - The callback function to be removed from the event's listener list.
 */
function removeEventListener(
	event: IntentEventName,
	callback: IntentEventListener,
) {
	events[event] = Array.from(events[event]).filter((cb) => cb !== callback);
}
