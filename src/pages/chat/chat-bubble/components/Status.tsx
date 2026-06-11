export default function Status({ status }: { status?: string }) {
	if (!status) {
		return null;
	}

	switch (status) {
		case "completed":
			return <span className="icon-check" />;
		case "fail":
			return (
				<span
					className="icon-alert-triangle"
					style={{ color: "var(--error)" }}
				/>
			);
		default:
			return <span className="icon-help-center" />;
	}
}
