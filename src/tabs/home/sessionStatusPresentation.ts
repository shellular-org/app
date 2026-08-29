import type { AiSessionRuntimeStatus } from "@shellular/protocol";
import type { SemanticStatusTone } from "components/SemanticStatusIcon";

export interface SessionStatusPresentation {
	label: string;
	icon: string;
	tone: SemanticStatusTone;
	animated: boolean;
}

const SESSION_STATUS: Record<
	AiSessionRuntimeStatus,
	SessionStatusPresentation
> = {
	starting: {
		label: "Starting",
		icon: "icon-loader",
		tone: "info",
		animated: true,
	},
	running: {
		label: "Working",
		icon: "icon-loader",
		tone: "info",
		animated: true,
	},
	waiting_for_permission: {
		label: "Waiting for permission",
		icon: "icon-shield",
		tone: "warning",
		animated: false,
	},
	stopping: {
		label: "Stopping",
		icon: "icon-loader",
		tone: "muted",
		animated: true,
	},
	stopped: {
		label: "Stopped",
		icon: "icon-stop-circle",
		tone: "muted",
		animated: false,
	},
	finished: {
		label: "Finished",
		icon: "icon-check-circle",
		tone: "success",
		animated: false,
	},
	error: {
		label: "Error",
		icon: "icon-alert-circle",
		tone: "danger",
		animated: false,
	},
	cancelled: {
		label: "Cancelled",
		icon: "icon-x",
		tone: "muted",
		animated: false,
	},
};

export function getSessionStatusPresentation(
	status: AiSessionRuntimeStatus,
): SessionStatusPresentation {
	return SESSION_STATUS[status];
}
