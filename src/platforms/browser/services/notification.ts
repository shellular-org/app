/**
 * @typedef {object} NotificationOptions
 * @property {string} options.icon
 * @property {boolean} options.silent
 * @property {boolean} options.vibrate
 * @property {boolean} options.renotify
 */

/**
 * @typedef {object} NotificationSet
 * @property {number} id
 * @property {boolean} isClosed
 * @property {Notification} notification
 * @property {NotificationOptions} options
 */

let notificationCount = 0;
type NotificationCreateOptions = {
	icon?: string;
	silent?: boolean;
	renotify?: boolean;
	vibrate?: boolean;
};

type NotificationSet = {
	id: number;
	isClosed: boolean;
	notification: Notification;
	options: NotificationCreateOptions;
};

const notifications = new Map<number, NotificationSet>();

export default {
	/**
	 * Create notification with title, message and options
	 * @param {object} callback
	 * @param {[string, string, NotificationOptions]} args
	 */
	create(
		callback: Callback,
		[title, message, options]: [string, string, NotificationCreateOptions],
	) {
		const notification = createNotification(title, message, options);
		const id = notificationCount++;
		const set = {
			id,
			notification,
			isClosed: false,
			options: options || {},
		};

		notifications.set(id, set);

		notification.onclose = () => {
			set.isClosed = true;
		};

		notification.onshow = () => {
			set.isClosed = false;
		};

		callback.success(id);
	},
	show(callback: Callback, [id]: [number]) {
		const set = notifications.get(id);
		if (set?.isClosed) {
			const { notification, options } = set;
			const newNotification = createNotification(
				notification.title,
				notification.body,
				options,
			);
			newNotification.onclose = () => {
				set.isClosed = true;
			};
			newNotification.onshow = () => {
				set.isClosed = false;
			};
			set.notification = newNotification;
			set.isClosed = false;
		}
		callback.success();
	},
	hide(callback: Callback, [id]: [number]) {
		const set = notifications.get(id);
		if (set) {
			set.notification.close();
			callback.success();
			return;
		}

		callback.error("Notification not found");
	},
	delete(callback: Callback, [id]: [number]) {
		const set = notifications.get(id);
		if (!set) {
			callback.error("Notification not found");
			return;
		}
		set.notification.close();
		notifications.delete(id);
		callback.success();
	},
	addListener(callback: Callback, [id]: [number]) {
		const set = notifications.get(id);
		if (set) {
			callback.keep = true;
			set.notification.onclick = () => {
				callback.success();
			};
		}
	},
};

/**
 * Creates a new notification.
 *
 * @param {string} title - The title of the notification.
 * @param {string} message - The message body of the notification.
 * @param {Object} options - Additional options for the notification.
 * @param {string} options.icon - The URL of the icon to be displayed in the notification.
 * @param {boolean} options.silent - Whether the notification should be silent.
 * @param {boolean} options.renotify - Whether the notification should be renotified.
 * @param {boolean} options.vibrate - Whether the notification should vibrate.
 * @returns {Notification} The created notification instance.
 */
function createNotification(
	title: string,
	message: string,
	options: NotificationCreateOptions,
): Notification {
	return new Notification(title, {
		body: message,
		icon: options.icon,
	});
}
