import clsx from "clsx";
import { useCallback, useEffect, useRef } from "react";
import { beginWorkbenchResize } from "./resizeInteraction";
import WorkbenchDivider from "./WorkbenchDivider";

interface SidebarResizeHandleProps {
	value: number;
	min: number;
	max: number;
	onResize: (width: number) => void;
	onResizeEnd: (width: number) => void;
	ariaLabel?: string;
	className?: string;
	edge?: "left" | "right";
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
	ariaLabel = "Resize sidebar",
	className,
	edge = "right",
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
			const delta = event.clientX - drag.startX;
			const width = clamp(
				drag.startWidth + (edge === "left" ? -delta : delta),
			);
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
	}, [clamp, edge, finish]);

	return (
		<WorkbenchDivider
			className={clsx("workbench-sidebar-resizer", className)}
			interactive
			orientation="vertical"
			aria-label={ariaLabel}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			data-resize-edge={edge}
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
				const direction = event.key === "ArrowRight" ? 1 : -1;
				const width = clamp(
					valueRef.current + (edge === "left" ? -direction : direction) * 10,
				);
				valueRef.current = width;
				callbacksRef.current.onResize(width);
				callbacksRef.current.onResizeEnd(width);
			}}
		/>
	);
}
