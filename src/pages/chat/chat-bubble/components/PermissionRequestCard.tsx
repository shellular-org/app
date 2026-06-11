import "./PermissionRequestCard.scss";
import Mascot from "components/Mascot";
import type { AcpPermissionRequest } from "state/acp";
import NameIcon from "./NameIcon";
import ToolCallContentView from "./ToolCallContentView";
import ToolOutputView from "./ToolOutputView";

export default function PermissionRequestCard({
	permission,
	onReply,
}: {
	permission: AcpPermissionRequest;
	onReply: (permission: AcpPermissionRequest, optionId: string) => void;
}) {
	const options = readPermissionOptions(permission);
	const title = getTitle(permission);
	const content = getContent(permission, title);
	return (
		<div className="chat-permission-card chat-bubble chat-bubble--assistant">
			<div className="chat-permission-title">
				<NameIcon name={permission.kind} />
				<big>Permission</big>
				<Mascot state="permission" size={34} tone="inline" />
			</div>
			<span className="chat-permission-title">{title}</span>
			{content}
			<div className="chat-permission-actions">
				{options.map((option) => (
					<button
						type="button"
						key={option.optionId}
						className={`chat-permission-btn chat-permission-btn--${permissionOptionTone(option.kind)}`}
						onClick={() => onReply(permission, option.optionId)}
					>
						{option.name}
					</button>
				))}
			</div>
		</div>
	);
}

function readPermissionOptions(permission: AcpPermissionRequest) {
	return permission.options.flatMap((option) => {
		if (!option || typeof option !== "object") return [];
		const record = option as Record<string, unknown>;
		if (
			typeof record.optionId !== "string" ||
			typeof record.name !== "string" ||
			typeof record.kind !== "string"
		) {
			return [];
		}
		return [
			{
				optionId: record.optionId,
				name: record.name,
				kind: record.kind,
			},
		];
	});
}

function getContent(permission: AcpPermissionRequest, title: string) {
	const { metadata } = permission;
	const defaultView = (
		<ToolOutputView output={permission.title} title={title} />
	);
	if (!metadata || typeof metadata !== "object" || !("toolCall" in metadata)) {
		return defaultView;
	}

	const { toolCall } = metadata;

	if (!toolCall || typeof toolCall !== "object" || !("rawInput" in toolCall)) {
		return defaultView;
	}

	const { rawInput } = toolCall;

	if (!rawInput || typeof rawInput !== "object") {
		return defaultView;
	}

	if (permission.kind === "edit") {
		if (!("changes" in rawInput)) {
			return defaultView;
		}

		const { changes } = rawInput;

		if (!changes || typeof changes !== "object" || !Object.keys(changes)) {
			return defaultView;
		}

		return Object.keys(changes).map((key) => {
			const value = (changes as Record<string, unknown>)[key];

			if (!value || typeof value !== "object" || !("unified_diff" in value)) {
				return null;
			}

			let name = "edit";

			if ("type" in value && typeof value.type === "string") {
				name = value.type;
			}

			return (
				<ToolCallContentView
					key={key}
					part={{
						id: permission.id,
						name: name,
						type: "tool_call",
						title: key,
						output: value.unified_diff as string,
					}}
				/>
			);
		});
	}

	return defaultView;
}

function getTitle(permission: AcpPermissionRequest) {
	const { metadata } = permission;
	const defaultTitle = permission.title;

	if (!metadata || typeof metadata !== "object" || !("toolCall" in metadata)) {
		return defaultTitle;
	}

	const { toolCall } = metadata;

	if (!toolCall || typeof toolCall !== "object" || !("rawInput" in toolCall)) {
		return defaultTitle;
	}

	if (permission.kind === "execute") {
		return getExecuteTitle(toolCall, defaultTitle);
	}

	if (permission.kind === "edit") {
		if (!("content" in toolCall) || !Array.isArray(toolCall.content)) {
			return defaultTitle;
		}

		const totalFiles = toolCall.content.length;
		return `Edit ${totalFiles} ${totalFiles > 1 ? "files" : "file"}`;
	}

	return defaultTitle;
}

function getExecuteTitle(
	toolCall: Record<string, unknown>,
	defaultTitle: string,
) {
	const { rawInput } = toolCall;

	if (!rawInput || typeof rawInput !== "object" || !("reason" in rawInput)) {
		return defaultTitle;
	}

	const { reason } = rawInput;

	if (!reason || typeof reason !== "string") {
		return defaultTitle;
	}

	return reason;
}

function permissionOptionTone(kind: string): string {
	if (kind.startsWith("reject")) return "reject";
	if (kind === "allow_always") return "always";
	return "allow";
}
