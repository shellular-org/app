import { useCallback, useEffect, useRef } from "react";
import { beginWorkbenchResize } from "./resizeInteraction";

interface SidebarResizeHandleProps {
	value: number;
	min: number;
	max: number;
	onResize: (width: number) => void;
	onResizeEnd: (width: number) => void;
}

interface ActiveDrag {
	pointerId: number;
	startX: number;
	startWidth: number;
	width: number;
	target: HTMLElement;
	finishInteraction: () => void;
}

export default function SidebarResizeHandle({
	value,
	min,
	max,
	onResize,
	onResizeEnd,
}: SidebarResizeHandleProps) {
	const dragRef = useRef<ActiveDrag | null>(null);
	const valueRef = useRef(value);
	const boundsRef = useRef({ min, max });
	const callbacksRef = useRef({ onResize, onResizeEnd });
	valueRef.current = value;
	boundsRef.current = { min, max };
	callbacksRef.current = { onResize, onResizeEnd };

	const clamp = useCallback((width: number) => {
		const bounds = boundsRef.current;
		return Math.min(bounds.max, Math.max(bounds.min, width));
	}, []);

	const finish = useCallback((pointerId?: number) => {
		const drag = dragRef.current;
		if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) {
			return;
		}
		dragRef.current = null;
		if (drag.target.hasPointerCapture?.(drag.pointerId)) {
			drag.target.releasePointerCapture?.(drag.pointerId);
		}
		drag.finishInteraction();
		callbacksRef.current.onResizeEnd(drag.width);
	}, []);

	useEffect(() => {
		const move = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== event.pointerId) return;
			event.preventDefault();
			const width = clamp(drag.startWidth + event.clientX - drag.startX);
			if (width === drag.width) return;
			drag.width = width;
			valueRef.current = width;
			callbacksRef.current.onResize(width);
		};
		const end = (event: PointerEvent) => finish(event.pointerId);
		const blur = () => finish();
		window.addEventListener("pointermove", move, { passive: false });
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", end);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", end);
			window.removeEventListener("blur", blur);
			finish();
		};
	}, [clamp, finish]);

	return (
		// biome-ignore lint/a11y/useSemanticElements: the interactive separator must support pointer capture and keyboard resizing.
		<div
			className="workbench-sidebar-resizer"
			role="separator"
			aria-label="Resize sidebar"
			aria-orientation="vertical"
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			tabIndex={0}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				finish();
				const target = event.currentTarget;
				target.setPointerCapture?.(event.pointerId);
				dragRef.current = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startWidth: valueRef.current,
					width: valueRef.current,
					target,
					finishInteraction: beginWorkbenchResize("col-resize"),
				};
			}}
			onKeyDown={(event) => {
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				event.preventDefault();
				const width = clamp(
					valueRef.current + (event.key === "ArrowRight" ? 10 : -10),
				);
				valueRef.current = width;
				callbacksRef.current.onResize(width);
				callbacksRef.current.onResizeEnd(width);
			}}
		/>
	);
}
