import KeyboardToolbar, { type KeyHandler } from "components/KeyboardToolbar";
import { useEffect, useRef, useState } from "react";
import { useShellular } from "state";
import {
	getModifierState,
	setModifierState,
	subscribeTerminals,
} from "state/terminals";

interface Props {
	activeTerminalId: string | null;
	showPaste?: boolean;
	onPasteOpen?: () => void;
	onPasteClose?: () => void;
}

const SEQUENCES: Record<string, string> = {
	Escape: "\x1b",
	Tab: "\t",
	Home: "\x1b[H",
	End: "\x1b[F",
	PageUp: "\x1b[5~",
	PageDown: "\x1b[6~",
	ArrowUp: "\x1b[A",
	ArrowDown: "\x1b[B",
	ArrowRight: "\x1b[C",
	ArrowLeft: "\x1b[D",
};

export default function TerminalToolbar({
	activeTerminalId,
	showPaste = false,
	onPasteOpen,
	onPasteClose,
}: Props) {
	const { getXterm } = useShellular();
	const [ctrl, setCtrl] = useState(false);
	const [alt, setAlt] = useState(false);
	const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (!activeTerminalId) return;
		const sync = () => {
			const m = getModifierState(activeTerminalId);
			setCtrl(m.ctrl);
			setAlt(m.alt);
		};
		sync();
		return subscribeTerminals(sync);
	}, [activeTerminalId]);

	const handleKey: KeyHandler = (e) => {
		if (e.type !== "keydown") return;
		if (!activeTerminalId) return;
		const xterm = getXterm(activeTerminalId);
		if (!xterm) return;

		const { key, ctrlKey, metaKey, shiftKey } = e;

		if (key === "Control") {
			const m = getModifierState(activeTerminalId);
			setModifierState(activeTerminalId, { ctrl: !m.ctrl });
			return;
		}
		if (key === "Alt") {
			const m = getModifierState(activeTerminalId);
			setModifierState(activeTerminalId, { alt: !m.alt });
			return;
		}

		// Undo: Ctrl+Z or Cmd+Z → readline Ctrl+_ (\x1f). No standard redo.
		if ((ctrlKey || metaKey) && key === "z" && !shiftKey) {
			xterm.input("\x1f");
			xterm.focus();
			return;
		}

		const seq = SEQUENCES[key];
		if (seq) {
			xterm.input(seq);
			xterm.focus();
		}
	};

	const handleHideKeyboard = () => {
		const xterm = activeTerminalId ? getXterm(activeTerminalId) : null;
		xterm?.blur();
	};

	useEffect(() => {
		if (showPaste) {
			const textarea = pasteTextareaRef.current;
			if (!textarea) return;
			textarea.value = "";
			navigator.clipboard
				?.readText()
				.then((t) => {
					if (t && textarea) textarea.value = t;
				})
				.catch(() => {});
			requestAnimationFrame(() => textarea.focus());
		}
	}, [showPaste]);

	const handlePasteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		if (!activeTerminalId) return;
		const xterm = getXterm(activeTerminalId);
		if (!xterm) return;
		const text = e.currentTarget.value;
		if (text) xterm.input(text);
		xterm.input("\r");
		e.currentTarget.value = "";
	};

	if (!activeTerminalId) return null;

	return (
		<KeyboardToolbar
			handleKey={handleKey}
			modifiers={{ ctrl, alt, meta: false }}
			onHideKeyboard={handleHideKeyboard}
			swipeLeftPanel={
				<textarea
					ref={pasteTextareaRef}
					className="terminal-paste-textarea"
					onKeyDown={handlePasteKeyDown}
					placeholder="Paste to terminal…"
					rows={2}
					spellCheck={false}
					autoCorrect="off"
					autoCapitalize="none"
				/>
			}
			swipeLeftOpen={showPaste}
			onSwipeLeftOpen={onPasteOpen}
			onSwipeLeftClose={onPasteClose}
		/>
	);
}
