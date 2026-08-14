import {
	getToolCallContentParts,
	messagePartToMarkdown,
	type ToolCallPart,
} from "../lib/messageParts";
import { getRenderPartKey } from "../lib/utils";
import ChatDisclosure from "./ChatDisclosure";
import MessagePartView from "./MessagePartView";
import NameIcon from "./NameIcon";
import Status from "./Status";
import ToolOutputView from "./ToolOutputView";

export default function ToolCallContentView({ part }: { part: ToolCallPart }) {
	let parts = getToolCallContentParts(part);
	const locations = readToolLocations(part);

	if (parts.find(({ type }) => type === "file_change")) {
		parts = parts.filter(({ type }) => type === "file_change");

		return (
			<>
				{parts.map((contentPart, index) => (
					<MessagePartView
						key={getRenderPartKey(contentPart, index)}
						part={contentPart}
					/>
				))}
			</>
		);
	}

	if (part.output) {
		return (
			<ChatDisclosure
				className={statusModifier(part.status)}
				copyText={() => messagePartToMarkdown(part)}
				copyLabel="Copy tool call"
				summary={
					<>
						<span className="shrink-0">
							<NameIcon name={part.name} />
						</span>
						<span className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-normal [overflow-wrap:anywhere] [word-break:break-word]">
							{part.title}
						</span>
						<span className="shrink-0">
							<Status status={part.status} />
						</span>
					</>
				}
			>
				<ToolLocations locations={locations} />
				<ToolOutputView
					title={part.title || "Tool Call"}
					output={part.output}
					toolArguments={part.arguments}
				/>
			</ChatDisclosure>
		);
	}

	if (parts.every(({ type }) => type === "text")) {
		return (
			<ChatDisclosure
				copyText={() => messagePartToMarkdown(part)}
				copyLabel="Copy tool call"
				summary={
					<>
						<span className="icon-tool shrink-0" />
						<span className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-normal [overflow-wrap:anywhere] [word-break:break-word]">
							{part.title}
						</span>
					</>
				}
				className="chat-part-card"
			>
				<div style={{ padding: "10px", background: "var(--surface-soft)" }}>
					{parts.map((contentPart, index) => (
						<MessagePartView
							key={getRenderPartKey(contentPart, index)}
							part={contentPart}
						/>
					))}
				</div>
			</ChatDisclosure>
		);
	}

	return (
		<>
			<ToolLocations locations={locations} />
			{parts.map((contentPart, index) => (
				<MessagePartView
					key={getRenderPartKey(contentPart, index)}
					part={contentPart}
				/>
			))}
		</>
	);
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
