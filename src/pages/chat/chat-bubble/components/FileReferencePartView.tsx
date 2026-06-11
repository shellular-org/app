import "./FileReferencePartView.scss";
import type { AcpMessagePart } from "@shellular/protocol";
import { getFileIcon } from "lib/fileIcon";
import { formatFileSize } from "lib/utils";

export default function FileReferencePartView({
	part,
}: {
	part: Extract<AcpMessagePart, { type: "file_reference" }>;
}) {
	const name = part.name || part.path.split("/").pop() || part.path;
	const title = part.title || name;
	const isImage =
		part.mimeType?.startsWith("image/") || getFileIcon(name) === "icon-image";
	return (
		<span
			className={`file-reference${isImage ? " file-reference--image" : ""}`}
			data-path={part.path}
			title={part.path}
		>
			<span className={getFileIcon(name)} aria-hidden="true" />{" "}
			<span>{title}</span>
			{part.size !== undefined && <em>{formatFileSize(part.size)}</em>}
		</span>
	);
}
