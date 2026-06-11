import "./style.scss";
import type { Terminal } from "@xterm/xterm";
import Page from "components/Page";
import { useEffect, useRef, useState } from "react";
import { getXterm } from "state/terminals";

interface Props {
	terminalId: string;
}

export default function TerminalTextview({ terminalId }: Props) {
	const [text, setText] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const terminal = getXterm(terminalId);
		if (!terminal) return;
		const pos = terminal.buffer.active;
		setText(extractText(terminal));
		requestAnimationFrame(() => {
			if (!scrollRef.current) return;
			const lineHeight = scrollRef.current.scrollHeight / pos.length;
			const scrollTop = pos.viewportY * lineHeight;

			scrollRef.current.scrollTop = scrollTop;
		});
	}, [terminalId]);

	const handleCopy = async () => {
		const selection = window.getSelection()?.toString() ?? "";
		const toCopy = selection || text;
		if (!toCopy) return;

		try {
			await navigator.clipboard.writeText(toCopy);
		} catch {
			const ta = document.createElement("textarea");
			ta.value = toCopy;
			ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand("copy");
			} finally {
				document.body.removeChild(ta);
			}
		}
	};

	return (
		<Page
			title="Terminal Output"
			className="terminal-textview"
			scrollRef={scrollRef}
			rightSlot={
				<button
					type="button"
					className="icon-copy"
					onClick={handleCopy}
					aria-label="Copy"
				/>
			}
		>
			<pre className="terminal-textview-pre">{text}</pre>
		</Page>
	);
}

/**
 * Extract readable plain text from xterm's rendered buffer.
 * Handles line-wrap correctly: xterm marks continuation lines with
 * `isWrapped`, so we join them without inserting a newline.
 * Returns an empty string when the live xterm instance is not available.
 */
function extractText(terminal: Terminal): string {
	const buffer = terminal.buffer.active;
	const lines: string[] = [];
	let currentLine = "";

	for (let i = 0; i < buffer.length; i++) {
		const line = buffer.getLine(i);
		if (!line) continue;

		// translateToString(true) trims trailing spaces on each terminal row
		const row = line.translateToString(true);

		if (i === 0 || !line.isWrapped) {
			// Beginning of a new logical line — commit the previous one
			if (i > 0) lines.push(currentLine);
			currentLine = row;
		} else {
			// Continuation of the same logical line (terminal wrapped it)
			currentLine += row;
		}
	}
	lines.push(currentLine);

	// Drop leading blank lines produced by empty scrollback rows
	let start = 0;
	while (start < lines.length && lines[start].trim() === "") start++;

	// Drop trailing blank lines
	let end = lines.length - 1;
	while (end > start && lines[end].trim() === "") end--;

	return lines.slice(start, end + 1).join("\n");
}
