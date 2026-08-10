import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../lib/utils";

/**
 * Copy-to-clipboard control with a brief "copied" acknowledgement.
 *
 * Used both for a whole message and for the individual folded sections inside
 * one (reasoning, tool calls). Everything foldable owns one of these, so the
 * message-level button can copy just the answer without putting the collapsed
 * content out of reach.
 */
export default function CopyButton({
	getText,
	label = "Copy",
	className,
}: {
	/** Read lazily: the text is only built when the user actually copies. */
	getText: () => string;
	label?: string;
	className?: string;
}) {
	const timeoutRef = useRef<number | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		return () => {
			if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
		};
	}, []);

	const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		const text = getText().trim();
		if (!text) return;

		await copyTextToClipboard(text);
		setCopied(true);
		if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
		timeoutRef.current = window.setTimeout(() => {
			setCopied(false);
			timeoutRef.current = null;
		}, 1400);
	};

	return (
		<button
			type="button"
			className={`chat-copy-btn${copied ? " chat-copy-btn--copied" : ""}${
				className ? ` ${className}` : ""
			}`}
			onClick={handleCopy}
			aria-label={copied ? "Copied" : label}
			title={copied ? "Copied" : label}
		>
			<span
				className={copied ? "icon-check" : "icon-copy"}
				aria-hidden="true"
			/>
		</button>
	);
}
