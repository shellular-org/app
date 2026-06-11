import { openAppDialog } from "components/AppDialog";

export default {
	alert(callback: Callback, [message, title]: [string, string]) {
		openAppDialog("alert", { message, title }).then(() => callback.success());
	},
	confirm(callback: Callback, [message, title]: [string, string]) {
		openAppDialog("confirm", { message, title }).then((result) =>
			callback.success(result),
		);
	},
	prompt(
		callback: Callback,
		[message, defaultValue, title]: [string, string, string],
	) {
		openAppDialog("prompt", { message, defaultValue, title }).then((result) =>
			callback.success(result),
		);
	},
};
