import ResizeObserver from "resize-observer-polyfill";

if (!window.ResizeObserver) {
	window.ResizeObserver = ResizeObserver;
}
