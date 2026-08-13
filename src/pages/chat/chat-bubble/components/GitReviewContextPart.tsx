import "./GitReviewContextPart.scss";
import type { GitReviewComment } from "pages/git-client/reviewComments";
import { useMemo, useState } from "react";

export default function GitReviewContextPart({
	comments,
}: {
	comments: GitReviewComment[];
}) {
	const [expanded, setExpanded] = useState(false);
	const fileCount = useMemo(
		() => new Set(comments.map((comment) => comment.path)).size,
		[comments],
	);
	const commentLabel = `${comments.length} inline ${comments.length === 1 ? "comment" : "comments"}`;
	const fileLabel = `${fileCount} ${fileCount === 1 ? "file" : "files"}`;

	return (
		<div className="chat-review-summary" data-expanded={expanded || undefined}>
			<button
				type="button"
				className="chat-review-summary__toggle"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
			>
				<span
					className="chat-review-summary__icon icon-git-pull-request"
					aria-hidden="true"
				/>
				<span className="chat-review-summary__title">
					<strong>Code review</strong>
					<em>
						{commentLabel} · {fileLabel}
					</em>
				</span>
				<span
					className={`chat-review-summary__chevron icon-chevron-${expanded ? "up" : "down"}`}
					aria-hidden="true"
				/>
			</button>
			{expanded && (
				<ol className="chat-review-summary__comments">
					{comments.map((comment) => {
						const fileName =
							comment.path.split(/[\\/]/).filter(Boolean).pop() || comment.path;
						const side = comment.side === "additions" ? "R" : "L";
						const range =
							comment.startLine === comment.endLine
								? `${side}${comment.startLine}`
								: `${side}${comment.startLine}–${side}${comment.endLine}`;
						return (
							<li key={comment.id}>
								<div>
									<strong>{fileName}</strong>
									<span>{range}</span>
								</div>
								<p>{comment.body}</p>
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}
