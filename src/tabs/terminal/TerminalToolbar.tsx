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

const TERMINAL_TOOLBAR_ROWS = [
	["esc", "undo", "redo", "interrupt", "home", "up", "end", "pageup"],
	["tab", "ctrl", "alt", "shift", "left", "down", "right", "pagedown"],
];

export default function TerminalToolbar({
	activeTerminalId,
	showPaste = false,
	onPasteOpen,
	onPasteClose,
}: Props) {
	const { getXterm } = useShellular();
	const [ctrl, setCtrl] = useState(false);
	const [alt, setAlt] = useState(false);
	const [shift, setShift] = useState(false);
	const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (!activeTerminalId) return;
		const sync = () => {
			const m = getModifierState(activeTerminalId);
			setCtrl(m.ctrl);
			setAlt(m.alt);
			setShift(m.shift);
		};
		sync();
		return subscribeTerminals(sync);
	}, [activeTerminalId]);

	const handleKey: KeyHandler = (e) => {
		if (e.type !== "keydown") return;
		if (!activeTerminalId) return;
		const xterm = getXterm(activeTerminalId);
		if (!xterm) return;

		const { key, ctrlKey, altKey, metaKey, shiftKey } = e;

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
		if (key === "Shift") {
			const m = getModifierState(activeTerminalId);
			setModifierState(activeTerminalId, { shift: !m.shift });
			return;
		}

		// Toolbar keys (Tab/arrows/etc.) don't carry the toggled ctrl/alt/shift
		// state on their own synthetic event, so fold in the toggled modifiers
		// here. Read from the store (getModifierState) rather than the React
		// `ctrl`/`alt`/`shift` state: those are a display mirror updated via a
		// subscription + re-render, so on fast taps (e.g. Shift then Tab) the
		// closure can still see the pre-toggle value and send a plain Tab
		// instead of back-tab. The store is always current.
		const m = getModifierState(activeTerminalId);
		const effectiveCtrl = ctrlKey || m.ctrl;
		const effectiveAlt = altKey || m.alt;
		const effectiveShift = shiftKey || m.shift;

		// The toolbar already folded the toggled modifiers into the sequence
		// below. Clear them *before* xterm.input() so the onData interceptor
		// (state/terminals.ts) — which fires synchronously during input() and
		// re-applies + resets modifiers from the store — doesn't double-apply
		// them to our already-encoded sequence.
		const clearModifiers = () => {
			if (m.ctrl || m.alt || m.shift) {
				setModifierState(activeTerminalId, {
					ctrl: false,
					alt: false,
					shift: false,
				});
			}
		};

		// Undo: Ctrl+Z or Cmd+Z → readline Ctrl+_ (\x1f). No standard redo.
		if ((effectiveCtrl || metaKey) && key === "z" && !effectiveShift) {
			clearModifiers();
			xterm.input("\x1f");
			xterm.focus();
			return;
		}

		// Interrupt: Ctrl+C → SIGINT (\x03).
		if (effectiveCtrl && key === "c") {
			clearModifiers();
			xterm.input("\x03");
			xterm.focus();
			return;
		}

		const seq = getTerminalSequence(key, {
			ctrl: effectiveCtrl,
			altKey: effectiveAlt,
			shiftKey: effectiveShift,
		});
		if (seq) {
			clearModifiers();
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
			modifiers={{ ctrl, alt, shift, meta: false }}
			onHideKeyboard={handleHideKeyboard}
			rows={TERMINAL_TOOLBAR_ROWS}
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

function getTerminalSequence(
	key: string,
	modifiers: { ctrl: boolean; altKey: boolean; shiftKey: boolean },
): string | undefined {
	if (
		key === "Tab" &&
		(modifiers.shiftKey || modifiers.ctrl || modifiers.altKey)
	) {
		if (modifiers.shiftKey && !modifiers.ctrl && !modifiers.altKey) {
			return "\x1b[Z";
		}
	}

	if (
		key === "ArrowUp" ||
		key === "ArrowDown" ||
		key === "ArrowRight" ||
		key === "ArrowLeft" ||
		key === "Home" ||
		key === "End" ||
		key === "PageUp" ||
		key === "PageDown"
	) {
		const modifierCode =
			1 +
			(modifiers.shiftKey ? 1 : 0) +
			(modifiers.altKey ? 2 : 0) +
			(modifiers.ctrl ? 4 : 0);

		if (modifierCode > 1) {
			switch (key) {
				case "ArrowUp":
					return `\x1b[1;${modifierCode}A`;
				case "ArrowDown":
					return `\x1b[1;${modifierCode}B`;
				case "ArrowRight":
					return `\x1b[1;${modifierCode}C`;
				case "ArrowLeft":
					return `\x1b[1;${modifierCode}D`;
				case "Home":
					return `\x1b[1;${modifierCode}H`;
				case "End":
					return `\x1b[1;${modifierCode}F`;
				case "PageUp":
					return `\x1b[5;${modifierCode}~`;
				case "PageDown":
					return `\x1b[6;${modifierCode}~`;
			}
		}
	}

	return SEQUENCES[key];
}
