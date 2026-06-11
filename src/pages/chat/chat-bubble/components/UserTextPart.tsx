import "./UserTextPart.scss";
import { useCallback, useMemo, useState } from "react";
import { renderInlineMarkdown } from "../lib/markdownRendering";
import { truncateHtmlAtTextBoundary } from "../lib/truncateText";

const MAX_USER_TEXT_CHARS = 200;

export default function UserTextPart({ text }: { text: string }) {
	const [expanded, setExpanded] = useState(false);

	const fullHtml = useMemo(
		() => renderInlineMarkdown(text, { referenceMode: "file-pills" }),
		[text],
	);

	const truncatedHtml = useMemo(
		() => truncateHtmlAtTextBoundary(fullHtml, MAX_USER_TEXT_CHARS),
		[fullHtml],
	);

	const isTruncated = truncatedHtml !== fullHtml;
	const displayHtml = expanded ? fullHtml : truncatedHtml;
	const toggle = useCallback(() => setExpanded((v) => !v), []);

	if (!isTruncated) {
		return (
			<span
				className="chat-user-text"
				dangerouslySetInnerHTML={{ __html: fullHtml }}
			/>
		);
	}

	return (
		<span className="chat-user-text chat-user-text--truncatable">
			<span dangerouslySetInnerHTML={{ __html: displayHtml }} />
			<button
				type="button"
				className={`bubble-expand-icon icon-chevron-${expanded ? "up" : "down"}`}
				onClick={toggle}
				aria-label={expanded ? "Collapse message" : "Expand message"}
			/>
		</span>
	);
}
