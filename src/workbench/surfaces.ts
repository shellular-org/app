import { getFileIcon } from "lib/fileIcon";
import type { GitFileStatus } from "state";
import type { EditorSurface, UtilityPage } from "./types";

export const utilityMetadata: Record<
	UtilityPage,
	{ title: string; icon: string; showConnectionBanner: boolean }
> = {
	settings: {
		title: "Settings",
		icon: "icon-settings",
		showConnectionBanner: false,
	},
	ports: {
		title: "Ports",
		icon: "icon-power-cord",
		showConnectionBanner: false,
	},
	about: { title: "About", icon: "icon-info", showConnectionBanner: false },
	"reach-out": {
		title: "Reach Out",
		icon: "icon-message-circle",
		showConnectionBanner: false,
	},
	account: {
		title: "Account",
		icon: "icon-user",
		showConnectionBanner: false,
	},
	"system-monitor": {
		title: "System Monitor",
		icon: "icon-activity",
		showConnectionBanner: true,
	},
};

export function createEditorSurface(input: {
	id?: string;
	filePath: string;
	title?: string;
	gitStatus?: GitFileStatus;
	initialLine?: number;
	initialColumn?: number;
	readOnly?: boolean;
}): EditorSurface {
	const title = input.title ?? basename(input.filePath);
	return {
		kind: "editor",
		id: input.id ?? input.filePath,
		title,
		icon: getFileIcon(title || input.filePath),
		filePath: input.filePath,
		gitStatus: input.gitStatus,
		initialLine: input.initialLine,
		initialColumn: input.initialColumn,
		readOnly: input.readOnly,
	};
}

function basename(path: string) {
	return path.split("/").pop() || path;
}
