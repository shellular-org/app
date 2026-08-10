/**
 * Tool-call status glyph. ACP statuses are pending | in_progress | completed
 * | failed; "fail" is kept for tolerance of non-conforming agents. Running
 * tools get a real spinner, terminal states get semantic color.
 */
export default function Status({ status }: { status?: string }) {
	if (!status) {
		return null;
	}

	switch (status) {
		case "completed":
			return (
				<span className="icon-check" style={{ color: "var(--success)" }} />
			);
		case "failed":
		case "fail":
			return (
				<span
					className="icon-alert-triangle"
					style={{ color: "var(--error)" }}
				/>
			);
		case "in_progress":
		case "pending":
			return (
				<span className="chat-status-spinner" role="img" aria-label="Running" />
			);
		default:
			return <span className="icon-help-center" />;
	}
}
