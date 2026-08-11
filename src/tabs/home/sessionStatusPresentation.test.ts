import type { AiSessionRuntimeStatus } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import { getSessionStatusPresentation } from "./sessionStatusPresentation";

describe("session status presentation", () => {
	it.each<[AiSessionRuntimeStatus, string, string, string, boolean]>([
		["starting", "Starting", "icon-loader", "info", true],
		["running", "Working", "icon-loader", "info", true],
		[
			"waiting_for_permission",
			"Waiting for permission",
			"icon-shield",
			"warning",
			false,
		],
		["stopping", "Stopping", "icon-loader", "muted", true],
		["stopped", "Stopped", "icon-stop-circle", "muted", false],
		["finished", "Finished", "icon-check-circle", "success", false],
		["error", "Error", "icon-alert-circle", "danger", false],
		["cancelled", "Cancelled", "icon-x", "muted", false],
	])("maps %s consistently", (status, label, icon, tone, animated) => {
		expect(getSessionStatusPresentation(status)).toEqual({
			label,
			icon,
			tone,
			animated,
		});
	});
});
