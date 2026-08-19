import { type ActivityKind, deriveActivityRow } from "../lib/activityRow";
import {
	formatPartValue,
	getToolCallContentParts,
	type ToolCallPart,
} from "../lib/messageParts";
import { getRenderPartKey } from "../lib/utils";
import ChatDisclosure from "./ChatDisclosure";
import MessagePartView from "./MessagePartView";
import Status from "./Status";
import ToolOutputView from "./ToolOutputView";

export default function ToolCallContentView({ part }: { part: ToolCallPart }) {
	const parts = getToolCallContentParts(part);
	const locations = readToolLocations(part);
	const row = deriveActivityRow(part);
	const hasDetails = Boolean(
		part.output || part.arguments || parts.length || locations.length,
	);
	const summary = (
		<>
			<span
				className={`${activityIcon(row.kind)} chat-work-row-icon`}
				aria-hidden="true"
			/>
			<span className="chat-work-row-label">
				{row.verb ? <strong>{row.verb}</strong> : null}
				{row.object ? <span> {row.object}</span> : null}
			</span>
			<span className="chat-work-row-status">
				<Status status={part.status} />
			</span>
		</>
	);
	if (!hasDetails) {
		return (
			<div className={`chat-work-row ${statusModifier(part.status) ?? ""}`}>
				<div className="chat-part-card-title">{summary}</div>
			</div>
		);
	}
	const contentParts = part.output
		? parts.filter(({ type }) => type === "file_change")
		: parts;
	return (
		<ChatDisclosure
			className={`chat-work-row ${statusModifier(part.status) ?? ""}`}
			card={false}
			summary={summary}
		>
			<ToolLocations locations={locations} />
			{part.output ? (
				<ToolOutputView
					title={part.title || row.verb || "Output"}
					output={part.output}
					toolArguments={part.arguments}
				/>
			) : null}
			{!part.output && part.arguments ? (
				<pre className="chat-work-row-arguments">
					{formatPartValue(part.arguments)}
				</pre>
			) : null}
			{contentParts.map((contentPart, index) => (
				<MessagePartView
					key={getRenderPartKey(contentPart, index)}
					part={contentPart}
				/>
			))}
		</ChatDisclosure>
	);
}

function activityIcon(kind: ActivityKind) {
	switch (kind) {
		case "execute":
			return "icon-terminal";
		case "read":
			return "icon-eye";
		case "change":
			return "icon-edit";
		case "search":
			return "icon-search";
		case "fetch":
			return "icon-globe";
		case "think":
			return "icon-cpu";
		case "switch_mode":
			return "icon-settings";
		default:
			return "icon-tool";
	}
}

/**
 * Terminal-state accent for a tool card. Only failures and in-flight calls get
 * a tint — marking every success green would make a normal run look like a
 * christmas tree.
 */
function statusModifier(status?: string): string | undefined {
	if (status === "failed" || status === "fail") {
		return "chat-part-card--failed";
	}
	if (status === "in_progress" || status === "pending") {
		return "chat-part-card--running";
	}
	return undefined;
}

interface ToolLocation {
	path: string;
	line?: number | null;
}

/**
 * ACP tool-call "follow-along" locations: the files a tool is touching.
 * Rendered as compact path chips under the tool card.
 */
function ToolLocations({ locations }: { locations: ToolLocation[] }) {
	if (locations.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-1 px-1 py-0.5">
			{locations.map((location) => {
				const name = location.path.split("/").pop() || location.path;
				const label =
					typeof location.line === "number" ? `${name}:${location.line}` : name;
				return (
					<span
						key={`${location.path}:${location.line ?? ""}`}
						title={location.path}
						className="rounded-md border border-(--card-border) px-1.5 py-0.5 font-mono text-xs text-(--secondary-text)"
					>
						{label}
					</span>
				);
			})}
		</div>
	);
}

function readToolLocations(part: ToolCallPart): ToolLocation[] {
	const raw = (part as { locations?: unknown }).locations;
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const record = item as Record<string, unknown>;
		if (typeof record.path !== "string" || !record.path) return [];
		return [
			{
				path: record.path,
				line: typeof record.line === "number" ? record.line : undefined,
			},
		];
	});
}
