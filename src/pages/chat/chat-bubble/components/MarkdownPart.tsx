import { useEffect, useMemo, useState } from "react";
import { preloadCodeBlockLanguages } from "../lib/codeHighlight";
import {
	collectMarkdownCodeLanguages,
	renderMarkdown,
} from "../lib/markdownRendering";

export default function MarkdownPart({ text }: { text: string }) {
	const [highlightVersion, setHighlightVersion] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const languages = collectMarkdownCodeLanguages(text);
		if (!languages.length) return;

		preloadCodeBlockLanguages(languages).then((changed) => {
			if (!cancelled && changed) {
				setHighlightVersion((version) => version + 1);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [text]);

	const html = useMemo(
		() => renderMarkdown(text, highlightVersion),
		[text, highlightVersion],
	);

	return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
