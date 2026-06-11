import Page from "components/Page";
import "./ToolArguments.scss";

export default function ToolArguments({
	args,
	title,
}: {
	args: string;
	title: string;
}) {
	const parsedArgs = parseArguments(args);
	const entries = Object.entries(parsedArgs);

	if (entries.length === 0) {
		return <p className="tool-arguments-empty">{args}</p>;
	}

	return (
		<Page
			title={title}
			subtitle="Tool Call Arguments"
			className="tool-arguments-page"
		>
			<table>
				<thead>
					<tr>
						<th>Argument</th>
						<th>Value</th>
					</tr>
				</thead>
				<tbody>
					{entries.map(([key, value]) => (
						<tr key={key}>
							<td className="arg-name">{key}</td>
							<td>
								<ArgumentValue value={value} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Page>
	);
}

function ArgumentValue({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="json-null">null</span>;
	}

	if (typeof value === "object") {
		return <pre className="json-block">{JSON.stringify(value, null, 2)}</pre>;
	}

	const parsed = tryParseJson(value);

	if (parsed !== undefined) {
		return (
			<pre className="json-block json-block--highlighted">
				{JSON.stringify(parsed, null, 2)}
			</pre>
		);
	}

	if (typeof value === "boolean") {
		return <span className="json-boolean">{String(value)}</span>;
	}

	if (typeof value === "number") {
		return <span className="json-number">{value}</span>;
	}

	return <span className="json-string">{String(value)}</span>;
}

function tryParseJson(value: unknown): unknown {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

function parseArguments(args: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(args);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return { value: parsed };
	} catch {
		return { args };
	}
}
