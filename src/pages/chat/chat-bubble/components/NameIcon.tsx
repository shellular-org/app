import "./NameIcon.scss";

export default function NameIcon({ name }: { name?: string }) {
	switch (name) {
		case "read":
			return <span className="icon-eye" />;
		case "tool":
			return <span className="icon-tool" />;
		case "edit":
			return <span className="icon-edit" />;
		case "execute":
			return <span className="icon-terminal" />;
		case "search":
			return <span className="icon-search" />;

		default:
			return <span className="icon-tool" />;
	}
}
