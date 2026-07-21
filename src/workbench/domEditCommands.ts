import type { WorkbenchSurfaceCommand } from "./store";

export type WorkbenchEditCommand = Exclude<WorkbenchSurfaceCommand, "save">;

function textControl(target: HTMLElement | null) {
	if (target instanceof HTMLTextAreaElement) return target;
	if (!(target instanceof HTMLInputElement)) return null;
	return /^(?:text|search|url|tel|email|password|number)$/i.test(target.type)
		? target
		: null;
}

function editableTarget(target: HTMLElement | null) {
	if (!target) return null;
	return (
		textControl(target) ??
		(target.isContentEditable
			? target
			: target.closest<HTMLElement>("[contenteditable=true]"))
	);
}

function hasSelection(target: HTMLElement | null) {
	const control = textControl(target);
	if (control) {
		return (
			typeof control.selectionStart === "number" &&
			typeof control.selectionEnd === "number" &&
			control.selectionEnd > control.selectionStart
		);
	}
	const selection = window.getSelection();
	return Boolean(selection && !selection.isCollapsed);
}

export function canRunDomEditCommand(
	command: WorkbenchEditCommand,
	target: HTMLElement | null,
) {
	const editable = editableTarget(target);
	switch (command) {
		case "copy":
			return hasSelection(target);
		case "select-all":
			return Boolean(target || document.body);
		case "undo":
		case "redo":
		case "cut":
		case "paste":
			return Boolean(editable && !editable.hasAttribute("readonly"));
	}
}

export async function runDomEditCommand(
	command: WorkbenchEditCommand,
	target: HTMLElement | null,
) {
	if (!canRunDomEditCommand(command, target)) return false;
	const editable = editableTarget(target);
	if (editable) editable.focus();

	if (command === "paste" && editable && navigator.clipboard?.readText) {
		const text = await navigator.clipboard.readText();
		const control = textControl(editable);
		if (control) {
			const start = control.selectionStart ?? control.value.length;
			const end = control.selectionEnd ?? start;
			control.setRangeText(text, start, end, "end");
			control.dispatchEvent(new Event("input", { bubbles: true }));
			return true;
		}
		return document.execCommand("insertText", false, text);
	}

	const browserCommand = command === "select-all" ? "selectAll" : command;
	return document.execCommand(browserCommand);
}
