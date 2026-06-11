import { indentLess, indentMore } from "@codemirror/commands";
import type { EditorView } from "codemirror";
import KeyboardToolbar from "components/KeyboardToolbar";
import { useCallback, useEffect, useState } from "react";

interface Props {
	editorView: EditorView;
}

export default function EditorToolbar({ editorView }: Props) {
	const [ctrlKey, setCtrlKey] = useState(false);
	const [altKey, setAltKey] = useState(false);
	const [metaKey, setMetaKey] = useState(false);

	const handleKey = useCallback(
		(key: KeyboardEvent) => {
			const dom = editorView.contentDOM;
			switch (key.key) {
				case "Control":
					setCtrlKey(!ctrlKey);
					break;
				case "Alt":
					setAltKey(!altKey);
					break;
				case "Meta":
					setMetaKey(!metaKey);
					break;
				case "Tab": {
					if (key.shiftKey) {
						indentLess(editorView);
					} else {
						indentMore(editorView);
					}
					return;
				}
			}

			dom.dispatchEvent(key);
		},
		[editorView, ctrlKey, altKey, metaKey],
	);

	useEffect(() => {
		if (!editorView) return;
		const dom = editorView.contentDOM;

		const interceptKeyDown = (e: KeyboardEvent) => {
			if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
			if (!ctrlKey && !altKey && !metaKey) return;
			if (
				ctrlKey === e.ctrlKey &&
				altKey === e.altKey &&
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
					shiftKey: e.shiftKey,
					metaKey: metaKey || e.metaKey,
					bubbles: true,
					cancelable: true,
				}),
			);
		};

		const interceptBeforeInput = (e: InputEvent) => {
			if (e.inputType !== "insertText" || !e.data) return;
			if (!ctrlKey && !altKey) return;
			e.preventDefault();

			dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: e.data,
					ctrlKey: ctrlKey,
					altKey: altKey,
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
	}, [editorView, ctrlKey, altKey, metaKey]);

	if (!editorView) return null;

	return (
		<KeyboardToolbar
			modifiers={{
				ctrl: ctrlKey,
				alt: altKey,
				meta: metaKey,
			}}
			onHideKeyboard={() => {
				editorView.contentDOM.blur();
			}}
			handleKey={handleKey}
			keyMap={{ ctrl: "meta" }}
		/>
	);
}
