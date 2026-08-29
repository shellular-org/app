import type { AiBackend } from "@shellular/protocol";
import { getAgentIcon } from "lib/agents";
import { openInWorkbench } from "./navigation";
import { createEditorSurface, utilityMetadata } from "./surfaces";
import type { UtilityPage } from "./types";

export function tryOpenChatSurface(input: {
	id: string;
	agentId: AiBackend;
	sessionId: string;
	title: string;
	workspacePath: string;
	createOnFirstMessage?: boolean;
}) {
	return openInWorkbench({
		kind: "chat",
		icon: getAgentIcon(input.agentId),
		...input,
	});
}

export function tryOpenUtilitySurface(
	page: UtilityPage,
	title: string,
	icon: string,
	showConnectionBanner = false,
) {
	const metadata = utilityMetadata[page] ?? {
		title,
		icon,
		showConnectionBanner,
	};
	return openInWorkbench({
		kind: "utility",
		id: `utility:${page}`,
		page,
		...metadata,
	});
}

export function tryOpenFileSurface(input: {
	id: string;
	title: string;
	initialPath: string;
	mode: "project";
}) {
	return openInWorkbench({
		kind: "files",
		icon: "icon-folder",
		...input,
	});
}

export function tryOpenEditorSurface(
	input: Parameters<typeof createEditorSurface>[0],
) {
	return openInWorkbench(createEditorSurface(input));
}
