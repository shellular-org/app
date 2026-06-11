import permissions from "lib/permissions";
import bridge from "./bridge";
import native from "./native";

const ids: number[] = [];
const MAX_NOTIFICATIONS = 10;
const notification = bridge("Notification");

export default {
	async create(
		title: string,
		message: string,
		options: {
			icon?: string;
			silent?: boolean;
			vibrate?: boolean;
			renotify?: boolean;
		} = {},
	) {
		if (!(await native.hasPermission(permissions.NOTIFICATION))) {
			await native.requestPermission(permissions.NOTIFICATION);
		}

		if (ids.length >= MAX_NOTIFICATIONS) {
			const id = ids.shift();
			await notification("delete", [id]);
		}

		const id = (await notification("create", [
			title,
			message,
			options,
		])) as number;
		ids.push(id);
		return {
			show() {
				return notification("show", [id]);
			},
			hide() {
				return notification("hide", [id]);
			},
			delete() {
				return notification("delete", [id]);
			},
			on(event: string, callback: (...args: unknown[]) => void) {
				Bridge.exec(callback, console.error, "Notification", "addListener", [
					id,
					event,
				]);
			},
		};
	},
};
