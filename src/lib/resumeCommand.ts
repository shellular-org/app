import type { AiBackend } from "@shellular/protocol";

export function getResumeCommand(
	backend: AiBackend,
	sessionId: string,
	workspacePath?: string,
	platform?: string,
): string {
	const joiner = platform?.toLowerCase() === "win32" ? "; " : " && ";
	const cd = workspacePath ? `cd ${workspacePath}${joiner}` : "";
	switch (backend) {
		case "claude-code":
			return `${cd}claude --resume ${sessionId}`;
		case "codex":
			return `${cd}codex resume ${sessionId}`;
		case "opencode":
			return `${cd}opencode --session ${sessionId}`;
		case "copilot":
			return `${cd}copilot --resume=${sessionId}`;
		case "cursor":
			return `${cd}cursor-agent --resume ${sessionId}`;
		case "pi":
			return `${cd}pi --resume ${sessionId}`;
		case "hermes":
			return `${cd}hermes --resume ${sessionId}`;
		default:
			return `Session: ${sessionId}`;
	}
}
