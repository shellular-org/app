import type { AiBackend } from "@shellular/protocol";
import type { AppMenuItem } from "components/AppMenu";
import type { AcpAgentInfo } from "state/acp";

export function getAgentIcon(agent: AiBackend) {
	switch (agent) {
		case "opencode":
			return "icon-opencode";
		case "claude-code":
			return "icon-claude";
		case "codex":
			return "icon-codex";
		case "pi":
			return "icon-pi";
		case "copilot":
			return "icon-copilot";
		case "hermes":
			return "icon-hermes";
		case "cursor":
			return "icon-cursor";
		case "grok-build":
			return "icon-grok";
		default:
			return "icon-message-square";
	}
}

export function getInstallationOptions(
	agent: AcpAgentInfo,
	platform: string | undefined,
	handelInstall: (command: string) => void,
): AppMenuItem[] {
	if (!agent.installationCommands || !platform) return [];

	const normalized = normalizePlatform(platform);

	return Object.entries(agent.installationCommands)
		.filter(
			([, info]) =>
				info.os.includes("all") ||
				info.os.map((s) => s.toLowerCase()).includes(normalized),
		)
		.map(([name, info]) => ({
			key: name,
			label: name,
			icon: getCommandIcon(name),
			subText: info.command,
			onClick: () => handelInstall(info.command),
		}));
}

function normalizePlatform(platform: string): string {
	const p = platform.toLowerCase();
	if (p.includes("darwin") || p.includes("mac")) return "macos";
	if (p.includes("win")) return "windows";
	if (p.includes("linux")) return "linux";
	return p;
}

function getCommandIcon(name: string) {
	switch (name.toLowerCase()) {
		case "shell":
			return "icon-terminal";

		case "homebrew":
			return "icon-homebrew";

		case "powershell":
			return "icon-powershell";

		case "cmd":
			return "ion-cmd";

		case "npm":
			return "icon-npm";

		case "bun":
			return "icon-bun";

		case "winget":
			return "icon-winget";

		default:
			return "icon-terminal";
	}
}
