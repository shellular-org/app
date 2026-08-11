import { type AppDialogOption, openAppDialog } from "components/AppDialog";

export default {
	message(message: string, title = ""): Promise<void> {
		return openAppDialog("alert", { message, title });
	},
	confirm(message: string, title = ""): Promise<boolean> {
		return openAppDialog("confirm", { message, title });
	},
	textInput(
		message: string,
		defaultValue = "",
		title = "",
	): Promise<string | null> {
		return openAppDialog("prompt", { message, defaultValue, title });
	},
	select(
		message: string,
		options: AppDialogOption[],
		title = "",
		defaultValue = "",
	): Promise<string | null> {
		return openAppDialog("select", {
			message,
			options,
			title,
			defaultValue,
		});
	},
	async selectProjectFile(
		message: string,
		options: AppDialogOption[],
		title = "New File",
	): Promise<{ projectPath: string; fileName: string } | null> {
		const result = await openAppDialog("select-text", {
			message,
			options,
			title,
			selectLabel: "Project",
			textLabel: "Filename",
		});
		return result
			? {
					projectPath: result.selectedValue,
					fileName: result.textValue,
				}
			: null;
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
