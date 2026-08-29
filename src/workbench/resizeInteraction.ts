const RESIZING_CLASS = "workbench-is-resizing";
const CURSOR_PROPERTY = "--workbench-resize-cursor";

export function beginWorkbenchResize(cursor: "col-resize" | "row-resize") {
	const root = document.documentElement;
	if (document.activeElement instanceof HTMLElement) {
		document.activeElement.blur();
	}
	window.getSelection()?.removeAllRanges();
	root.classList.add(RESIZING_CLASS);
	root.style.setProperty(CURSOR_PROPERTY, cursor);

	let finished = false;
	return () => {
		if (finished) return;
		finished = true;
		root.classList.remove(RESIZING_CLASS);
		root.style.removeProperty(CURSOR_PROPERTY);
	};
}
