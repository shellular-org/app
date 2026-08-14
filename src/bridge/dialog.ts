import { openAppDialog } from "components/AppDialog";

type ConfirmOptions = {
	confirmLabel?: string;
	cancelLabel?: string;
};

export default {
	message(message: string, title = ""): Promise<void> {
		return openAppDialog("alert", { message, title });
	},
	confirm(
		message: string,
		title = "",
		options?: ConfirmOptions,
	): Promise<boolean> {
		return openAppDialog("confirm", { message, title, ...options });
	},
	textInput(
		message: string,
		defaultValue = "",
		title = "",
	): Promise<string | null> {
		return openAppDialog("prompt", { message, defaultValue, title });
	},
	alert(message: string, title = ""): Promise<void> {
		return this.message(message, title);
	},
	prompt(
		message: string,
		defaultValue = "",
		title = "",
	): Promise<string | null> {
		return this.textInput(message, defaultValue, title);
	},
};
