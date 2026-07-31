import Mascot from "components/Mascot";
import { useState } from "react";
import type { AcpElicitationRequest } from "state/acp";

/**
 * Renders an ACP elicitation: the agent asking the user for structured input.
 * Form mode renders inputs from the requested JSON schema (string, number,
 * boolean, enum). A single-enum form renders as tap-to-answer buttons, which
 * is the common "agent asks a multiple-choice question" shape. URL mode
 * renders an open-link button and waits for the completion event to remove
 * the card. All schema parsing is defensive: elicitation is UNSTABLE in ACP
 * v1, so unknown shapes degrade to a decline-only card rather than crashing.
 */
export default function ElicitationCard({
	elicitation,
	onReply,
}: {
	elicitation: AcpElicitationRequest;
	onReply: (
		elicitation: AcpElicitationRequest,
		action: "accept" | "decline" | "cancel",
		content?: Record<string, unknown>,
	) => void;
}) {
	const fields = readFormFields(elicitation);
	const [values, setValues] = useState<Record<string, unknown>>({});

	const setValue = (key: string, value: unknown) =>
		setValues((prev) => ({ ...prev, [key]: value }));

	const declineButton = (
		<button
			type="button"
			className="chat-permission-btn chat-permission-btn--reject"
			onClick={() => onReply(elicitation, "decline")}
		>
			Decline
		</button>
	);

	let body: React.ReactNode;
	if (elicitation.mode === "url" && elicitation.url) {
		body = (
			<div className="chat-permission-actions">
				<button
					type="button"
					className="chat-permission-btn chat-permission-btn--allow"
					onClick={() => {
						window.open(elicitation.url, "_blank", "noopener");
					}}
				>
					Open link
				</button>
				{declineButton}
			</div>
		);
	} else if (fields.length === 1 && fields[0].options?.length) {
		// Single choice question: answer with one tap.
		const field = fields[0];
		body = (
			<div className="chat-permission-actions">
				{(field.options ?? []).map((option) => (
					<button
						type="button"
						key={option.value}
						className="chat-permission-btn chat-permission-btn--allow"
						onClick={() =>
							onReply(elicitation, "accept", { [field.key]: option.value })
						}
					>
						{option.label}
					</button>
				))}
				{declineButton}
			</div>
		);
	} else if (fields.length > 0) {
		body = (
			<>
				<div className="flex flex-col gap-2">
					{fields.map((field) => (
						<label key={field.key} className="flex flex-col gap-1">
							<span className="text-sm font-medium text-(--primary-text)">
								{field.title}
							</span>
							{field.options ? (
								<div className="flex flex-wrap gap-1.5">
									{field.options.map((option) => (
										<button
											type="button"
											key={option.value}
											className={`chat-permission-btn ${
												values[field.key] === option.value
													? "chat-permission-btn--allow"
													: ""
											}`}
											onClick={() => setValue(field.key, option.value)}
										>
											{option.label}
										</button>
									))}
								</div>
							) : field.type === "boolean" ? (
								<div className="flex gap-1.5">
									{[
										{ label: "Yes", value: true },
										{ label: "No", value: false },
									].map((option) => (
										<button
											type="button"
											key={option.label}
											className={`chat-permission-btn ${
												values[field.key] === option.value
													? "chat-permission-btn--allow"
													: ""
											}`}
											onClick={() => setValue(field.key, option.value)}
										>
											{option.label}
										</button>
									))}
								</div>
							) : (
								<input
									type={field.type === "number" ? "number" : "text"}
									className="rounded-md border border-(--card-border) bg-transparent px-2 py-1.5 text-sm text-(--primary-text)"
									value={String(values[field.key] ?? "")}
									onChange={(event) =>
										setValue(
											field.key,
											field.type === "number"
												? Number(event.target.value)
												: event.target.value,
										)
									}
								/>
							)}
						</label>
					))}
				</div>
				<div className="chat-permission-actions">
					<button
						type="button"
						className="chat-permission-btn chat-permission-btn--allow"
						onClick={() => onReply(elicitation, "accept", values)}
					>
						Submit
					</button>
					{declineButton}
				</div>
			</>
		);
	} else {
		body = <div className="chat-permission-actions">{declineButton}</div>;
	}

	return (
		<div className="chat-permission-card chat-bubble chat-bubble--assistant">
			<div className="chat-permission-title">
				<big>Question</big>
				<Mascot state="permission" size={34} tone="inline" />
			</div>
			{elicitation.message && (
				<span className="chat-permission-title">{elicitation.message}</span>
			)}
			{body}
		</div>
	);
}

interface ElicitationField {
	key: string;
	title: string;
	type: string;
	options?: { value: string; label: string }[];
}

function readFormFields(
	elicitation: AcpElicitationRequest,
): ElicitationField[] {
	const properties = elicitation.requestedSchema?.properties;
	if (!properties || typeof properties !== "object") return [];
	return Object.entries(properties as Record<string, unknown>).flatMap(
		([key, value]) => {
			if (!value || typeof value !== "object") return [];
			const schema = value as Record<string, unknown>;
			const type = typeof schema.type === "string" ? schema.type : "string";
			const title = typeof schema.title === "string" ? schema.title : key;
			const enumValues = Array.isArray(schema.enum)
				? schema.enum.filter((item): item is string => typeof item === "string")
				: null;
			const enumNames =
				Array.isArray(schema.enumNames) && enumValues ? schema.enumNames : null;
			return [
				{
					key,
					title,
					type,
					options: enumValues?.length
						? enumValues.map((item, index) => ({
								value: item,
								label:
									typeof enumNames?.[index] === "string"
										? (enumNames[index] as string)
										: item,
							}))
						: undefined,
				},
			];
		},
	);
}
