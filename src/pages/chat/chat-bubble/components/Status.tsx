/**
 * Tool-call status glyph. ACP statuses are pending | in_progress | completed
 * | failed; "fail" is kept for tolerance of non-conforming agents. Running
 * tools get a real spinner, terminal states get semantic color.
 *
 * Every state has its own shape as well as its own colour, per WCAG SC 1.4.1
 * (Level A): colour alone may not be the only thing carrying the meaning.
 */
export default function Status({ status }: { status?: string }) {
	if (!status) {
		return null;
	}

	switch (status) {
		case "completed":
			return (
				<span
					className="icon-check"
					style={{ color: "var(--success)" }}
					role="img"
					aria-label="Done"
				/>
			);
		case "failed":
		case "fail":
			return (
				<span
					className="icon-alert-triangle"
					style={{ color: "var(--error)" }}
					role="img"
					aria-label="Failed"
				/>
			);
		case "in_progress":
		case "pending":
			return (
				<span className="chat-status-spinner" role="img" aria-label="Running" />
			);
		case "awaiting":
			// Blocked on a permission: not busy, waiting for the reader. A spinner
			// here says the machine is working when in fact it is the human who is
			// holding things up, which is the single most misleading state a row
			// can show.
			return (
				<span
					className="icon-clock"
					style={{ color: "var(--accent)" }}
					role="img"
					aria-label="Waiting for you"
				/>
			);
		default:
			// An unrecognised terminal status means the call ended without telling
			// us it succeeded. The VS Code extension resolves the same case to
			// failure; a neutral glyph here reads as "fine" and is the more
			// expensive mistake.
			return (
				<span
					className="icon-alert-triangle"
					style={{ color: "var(--error)" }}
					role="img"
					aria-label="Ended without a result"
				/>
			);
	}
}
