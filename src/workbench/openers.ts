import type { AiBackend } from "@shellular/protocol";
import { getAgentIcon } from "lib/agents";
import { openInWorkbench } from "./navigation";
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
	return openInWorkbench({
		kind: "utility",
		id: `utility:${page}`,
		page,
		title,
		icon,
		showConnectionBanner,
	});
}
