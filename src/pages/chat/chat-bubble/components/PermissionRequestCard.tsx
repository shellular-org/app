import Mascot from "components/Mascot";
import type { AcpPermissionRequest } from "state/acp";
import NameIcon from "./NameIcon";
import {
	permissionActionsClass,
	permissionButtonClass,
	permissionCardClass,
	permissionTitleClass,
} from "./permissionClasses";
import ToolCallContentView from "./ToolCallContentView";

export default function PermissionRequestCard({
	permission,
	onReply,
}: {
	permission: AcpPermissionRequest;
	onReply: (permission: AcpPermissionRequest, optionId: string) => void;
}) {
	const options = readPermissionOptions(permission);
	const title = getTitle(permission);
	const content = getContent(permission);
	// When the agent gave no reason, the heading *is* the command, and the
	// subject block below already shows it in full. Printing it twice buries
	// the reply buttons under a repeat.
	const showTitle = title !== permission.title;
	return (
		<div className={permissionCardClass}>
			<div className={permissionTitleClass}>
				<NameIcon name={permission.kind} />
				<big className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
					Permission
				</big>
				<Mascot
					state="permission"
					size={34}
					tone="inline"
					className="ml-auto shrink-0"
				/>
			</div>
			{showTitle ? <span className={permissionTitleClass}>{title}</span> : null}
			{content}
			<div className={permissionActionsClass}>
				{options.map((option) => (
					<button
						type="button"
						key={option.optionId}
						className={permissionButtonClass(option.kind)}
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

function getContent(permission: AcpPermissionRequest) {
	const { metadata } = permission;
	// Rendered directly, wrapping, with no height cap and no scroll region: this
	// is the string a tap is about to execute, so every character of it has to
	// be readable before the reader decides.
	const defaultView = (
		<pre className="m-0 mb-2.5 box-border max-w-full overflow-hidden whitespace-pre-wrap rounded-lg border border-(--card-border) px-2.5 py-2 font-['JetBrainsMono_Nerd_Font',ui-monospace,Menlo,monospace] text-[11px] leading-[1.5] text-(--primary-text) [overflow-wrap:anywhere] [word-break:break-word]">
			{permission.title}
		</pre>
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
