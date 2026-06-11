import type { AcpMessage, AcpMessagePart } from "@shellular/protocol";

export type ToolCallPart = AcpMessagePart & { type: "tool_call" };

const partKeys = new WeakMap<object, string>();
const messageKeys = new WeakMap<object, string>();
let partKeyCounter = 0;
let messageKeyCounter = 0;

export function getPartKey(part: AcpMessagePart): string {
	const id = "id" in part ? part.id : undefined;
	if (id) return id;
	const cached = partKeys.get(part);
	if (cached) return cached;
	partKeyCounter += 1;
	const key = `${part.type}-${partKeyCounter}`;
	partKeys.set(part, key);
	return key;
}

export function getMessageKey(message: AcpMessage): string {
	if (message.id) return message.id;
	if (message.requestId) return `${message.role}-${message.requestId}`;
	const cached = messageKeys.get(message);
	if (cached) return cached;
	messageKeyCounter += 1;
	const key = `${message.role}-${message.timestamp ?? "message"}-${messageKeyCounter}`;
	messageKeys.set(message, key);
	return key;
}

export function isCopyableMessagePart(part: AcpMessagePart): boolean {
	switch (part.type) {
		case "text":
		case "tool_call":
		case "reasoning":
		case "plan":
		case "command":
		case "file_reference":
		case "file_change":
		case "web_reference":
		case "resource":
			return true;
		default:
			return false;
	}
}

export function messagePartsToMarkdown(parts: AcpMessagePart[]): string {
	return parts
		.map((part) => messagePartToMarkdown(part))
		.filter(Boolean)
		.join("\n\n");
}

function messagePartToMarkdown(part: AcpMessagePart): string {
	switch (part.type) {
		case "text":
			return part.text || "";
		case "tool_call": {
			const sections = [part.title || part.name || "Tool call"];
			if (part.arguments) {
				sections.push(
					`Input:\n\`\`\`json\n${formatPartValue(part.arguments)}\n\`\`\``,
				);
			}
			if (part.output) {
				sections.push(`Output:\n\`\`\`\n${part.output}\n\`\`\``);
			}
			return sections.join("\n\n");
		}
		case "reasoning":
			return part.content || "";
		case "plan":
			return part.content || "";
		case "command": {
			const sections = [`\`\`\`sh\n${part.command}\n\`\`\``];
			if (part.cwd) sections.push(`cwd: ${part.cwd}`);
			if (part.output) sections.push(`\`\`\`\n${part.output}\n\`\`\``);
			return sections.join("\n\n");
		}
		case "file_reference":
			return part.title || part.name || part.path;
		case "file_change":
			return part.path;
		case "web_reference":
			return part.title ? `[${part.title}](${part.url})` : part.url;
		case "resource": {
			const title = part.title || part.name || part.uri;
			return [title, part.description, part.text].filter(Boolean).join("\n\n");
		}
		default:
			return "";
	}
}

export function formatPartValue(value: string): string {
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return value;
	}
}

export function parseTerminalOutput(
	output: string,
): { output: string; meta?: string } | null {
	try {
		const parsed = JSON.parse(output);
		if (!parsed || typeof parsed !== "object") return null;
		const record = parsed as Record<string, unknown>;
		if (typeof record.output !== "string") return null;
		const metadata =
			record.metadata && typeof record.metadata === "object"
				? (record.metadata as Record<string, unknown>)
				: {};
		const meta = [
			typeof metadata.exit_code === "number"
				? `exit ${metadata.exit_code}`
				: null,
			typeof metadata.duration_seconds === "number"
				? `${metadata.duration_seconds.toFixed(2)}s`
				: null,
		]
			.filter(Boolean)
			.join(" · ");
		return { output: record.output, meta: meta || undefined };
	} catch {
		return null;
	}
}

export function getToolCallContentParts(part: ToolCallPart): AcpMessagePart[] {
	return Array.isArray((part as { parts?: unknown }).parts)
		? (((part as unknown as { parts: AcpMessagePart[] }).parts ??
				[]) as AcpMessagePart[])
		: [];
}

export function isFinishedToolCall(part: ToolCallPart): boolean {
	const status = part.status?.toLowerCase();
	return (
		status === "completed" ||
		status === "terminal" ||
		status === "failed" ||
		status === "error" ||
		status === "cancelled" ||
		status === "canceled"
	);
}

export function summarizeToolStatuses(parts: ToolCallPart[]): string {
	const statuses = new Set(
		parts.map((part) => part.status?.toLowerCase()).filter(Boolean),
	);
	if (statuses.size === 1) return [...statuses][0] || "active";
	if (statuses.has("in_progress")) return "in progress";
	if (statuses.has("pending")) return "pending";
	if (statuses.has("failed") || statuses.has("error")) return "failed";
	if (statuses.has("completed")) return "completed";
	return "active";
}

export function getLanguageLabel(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	const aliases: Record<string, string> = {
		cjs: "javascript",
		css: "css",
		html: "html",
		js: "javascript",
		json: "json",
		jsonc: "json",
		jsx: "javascript",
		md: "markdown",
		mjs: "javascript",
		py: "python",
		rs: "rust",
		scss: "css",
		sh: "shell",
		ts: "typescript",
		tsx: "typescript",
		yaml: "yaml",
		yml: "yaml",
	};
	return aliases[ext] ?? ext;
}

export function formatPlanStatus(status: string | undefined): string {
	if (!status) return "pending";
	return status.replace(/_/g, " ").toLowerCase();
}

export function formatStopReason(stopReason: string): string {
	switch (stopReason) {
		case "cancelled":
			return "_Stopped by user._";
		case "max_tokens":
			return "_Stopped: maximum token limit reached._";
		case "max_turn_requests":
			return "_Stopped: maximum turn requests reached._";
		case "refusal":
			return "_Stopped: request refused._";
		default:
			return stopReason === "end_turn"
				? ""
				: `_Stopped: ${stopReason.replace(/_/g, " ")}._`;
	}
}
