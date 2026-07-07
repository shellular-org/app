import {
	indentLess,
	indentMore,
	redoDepth,
	undoDepth,
} from "@codemirror/commands";
import { Compartment, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import KeyboardToolbar from "components/KeyboardToolbar";
import { useCallback, useEffect, useState } from "react";

interface Props {
	editorView: EditorView;
}

const EDITOR_TOOLBAR_ROWS = [
	["esc", "undo", "redo", "del", "home", "up", "end", "pageup"],
	["tab", "ctrl", "alt", "shift", "left", "down", "right", "pagedown"],
];

export default function EditorToolbar({ editorView }: Props) {
	const [ctrlKey, setCtrlKey] = useState(false);
	const [altKey, setAltKey] = useState(false);
	const [metaKey, setMetaKey] = useState(false);
	const [shiftKey, setShiftKey] = useState(false);
	const [historyAvailability, setHistoryAvailability] = useState({
		canUndo: false,
		canRedo: false,
	});

	const handleKey = useCallback(
		(key: KeyboardEvent) => {
			const dom = editorView.contentDOM;
			const effectiveShift = shiftKey || key.shiftKey;

			switch (key.key) {
				case "Control":
					setCtrlKey(!ctrlKey);
					break;
				case "Alt":
					setAltKey(!altKey);
					break;
				case "Shift":
					setShiftKey(!shiftKey);
					break;
				case "Meta":
					setMetaKey(!metaKey);
					break;
				case "Tab": {
					if (effectiveShift) {
						indentLess(editorView);
					} else {
						indentMore(editorView);
					}
					return;
				}
			}

			dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: key.key,
					code: key.code,
					ctrlKey: ctrlKey || key.ctrlKey,
					altKey: altKey || key.altKey,
					shiftKey: effectiveShift,
					metaKey: metaKey || key.metaKey,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		[editorView, ctrlKey, altKey, metaKey, shiftKey],
	);

	useEffect(() => {
		if (!editorView) return;
		const dom = editorView.contentDOM;

		const interceptKeyDown = (e: KeyboardEvent) => {
			if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
			if (!ctrlKey && !altKey && !shiftKey && !metaKey) return;
			if (
				ctrlKey === e.ctrlKey &&
				altKey === e.altKey &&
				shiftKey === e.shiftKey &&
				metaKey === e.metaKey
			) {
				return;
			}

			e.preventDefault();
			e.stopImmediatePropagation();

			dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: e.key,
					code: e.code,
					ctrlKey: ctrlKey || e.ctrlKey,
					altKey: altKey || e.altKey,
					shiftKey: shiftKey || e.shiftKey,
					metaKey: metaKey || e.metaKey,
					bubbles: true,
					cancelable: true,
				}),
			);
		};

		const interceptBeforeInput = (e: InputEvent) => {
			if (e.inputType !== "insertText" || !e.data) return;
			if (!ctrlKey && !altKey && !shiftKey) return;
			e.preventDefault();

			dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: e.data,
					ctrlKey: ctrlKey,
					altKey: altKey,
					shiftKey: shiftKey,
					metaKey: metaKey,
					bubbles: true,
					cancelable: true,
				}),
			);
		};

		dom.addEventListener("keydown", interceptKeyDown, { capture: true });
		dom.addEventListener("beforeinput", interceptBeforeInput as EventListener, {
			capture: true,
		});
		return () => {
			dom.removeEventListener("keydown", interceptKeyDown, { capture: true });
			dom.removeEventListener(
				"beforeinput",
				interceptBeforeInput as EventListener,
				{ capture: true },
			);
		};
	}, [editorView, ctrlKey, altKey, shiftKey, metaKey]);

	useEffect(() => {
		if (!editorView) return;

		const historyListenerCompartment = new Compartment();
		const syncHistoryAvailability = () => {
			const next = {
				canUndo: undoDepth(editorView.state) > 0,
				canRedo: redoDepth(editorView.state) > 0,
			};
			setHistoryAvailability((current) =>
				current.canUndo === next.canUndo && current.canRedo === next.canRedo
					? current
					: next,
			);
		};

		syncHistoryAvailability();
		editorView.dispatch({
			effects: StateEffect.appendConfig.of(
				historyListenerCompartment.of(
					EditorView.updateListener.of(syncHistoryAvailability),
				),
			),
		});

		return () => {
			try {
				editorView.dispatch({
					effects: historyListenerCompartment.reconfigure([]),
				});
			} catch {}
		};
	}, [editorView]);

	if (!editorView) return null;

	return (
		<KeyboardToolbar
			modifiers={{
				ctrl: ctrlKey,
				alt: altKey,
				meta: metaKey,
				shift: shiftKey,
			}}
			onHideKeyboard={() => {
				editorView.contentDOM.blur();
			}}
			handleKey={handleKey}
			keyMap={{ ctrl: "meta" }}
			disabledKeys={[
				...(historyAvailability.canUndo ? [] : ["undo"]),
				...(historyAvailability.canRedo ? [] : ["redo"]),
			]}
			rows={EDITOR_TOOLBAR_ROWS}
		/>
	);
}
