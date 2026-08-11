import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";
import {
	normalizedExpandedPaneWeights,
	type PaneLayoutEntry,
} from "./paneLayout";
import { beginWorkbenchResize } from "./resizeInteraction";
import WorkbenchDivider from "./WorkbenchDivider";

export const PANE_HEADER_HEIGHT = 34;
export const PANE_MIN_BODY_HEIGHT = 96;
const INTERACTIVE_DIVIDER_HEIGHT = 4;
const DECORATIVE_DIVIDER_HEIGHT = 1;

interface PaneItem extends PaneLayoutEntry {
	id: string;
}

export default function ResizablePaneStack<T extends PaneItem>({
	items,
	onResize,
	renderPane,
	headerHeight = PANE_HEADER_HEIGHT,
	minimumBodyHeight = PANE_MIN_BODY_HEIGHT,
}: {
	items: T[];
	onResize: (
		beforeId: string,
		afterId: string,
		deltaWeight: number,
		minimumWeight: number,
	) => void;
	renderPane: (item: T) => ReactNode;
	headerHeight?: number;
	minimumBodyHeight?: number;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const expandedItems = items.filter((item) => item.expanded);
	const normalizedWeights = normalizedExpandedPaneWeights(items);
	const expandedWeightTotal = expandedItems.reduce(
		(sum, item) => sum + item.weight,
		0,
	);
	const boundaryCount = Math.max(0, items.length - 1);
	const interactiveBoundaryCount = Math.max(0, expandedItems.length - 1);
	const decorativeBoundaryCount = boundaryCount - interactiveBoundaryCount;
	const fixedHeight =
		(items.length - expandedItems.length) * headerHeight +
		interactiveBoundaryCount * INTERACTIVE_DIVIDER_HEIGHT +
		decorativeBoundaryCount * DECORATIVE_DIVIDER_HEIGHT;
	return (
		<div
			ref={containerRef}
			className="desktop-scroll-area flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto"
		>
			{items.map((item, index) => {
				const nextExpanded = items
					.slice(index + 1)
					.find((entry) => entry.expanded);
				const hasFollowingItem = index < items.length - 1;
				const resizableBoundary =
					hasFollowingItem && item.expanded && Boolean(nextExpanded);
				const style: CSSProperties = item.expanded
					? {
							flexGrow: normalizedWeights.get(item) ?? 1,
							flexBasis: 0,
							minHeight: headerHeight + minimumBodyHeight,
						}
					: { flex: `0 0 ${headerHeight}px` };
				return (
					<div className="contents" key={item.id}>
						<div
							className="flex min-h-0 w-full min-w-0 shrink flex-col overflow-hidden"
							style={style}
						>
							{renderPane(item)}
						</div>
						{resizableBoundary && nextExpanded ? (
							<PaneSash
								before={item}
								after={nextExpanded}
								containerRef={containerRef}
								expandedWeightTotal={expandedWeightTotal}
								fixedHeight={fixedHeight}
								headerHeight={headerHeight}
								minimumBodyHeight={minimumBodyHeight}
								onResize={onResize}
							/>
						) : hasFollowingItem ? (
							<WorkbenchDivider
								className="h-px w-full shrink-0"
								orientation="horizontal"
							/>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

function PaneSash({
	before,
	after,
	containerRef,
	expandedWeightTotal,
	fixedHeight,
	headerHeight,
	minimumBodyHeight,
	onResize,
}: {
	before: PaneItem;
	after: PaneItem;
	containerRef: React.RefObject<HTMLDivElement | null>;
	expandedWeightTotal: number;
	fixedHeight: number;
	headerHeight: number;
	minimumBodyHeight: number;
	onResize: (
		beforeId: string,
		afterId: string,
		deltaWeight: number,
		minimumWeight: number,
	) => void;
}) {
	const getMinimumWeight = () => {
		const height = containerRef.current?.clientHeight ?? 1;
		const availableHeight = Math.max(1, height - fixedHeight);
		const requested =
			((headerHeight + minimumBodyHeight) / availableHeight) *
			expandedWeightTotal;
		return Math.min((before.weight + after.weight) / 2, requested);
	};
	const startResize = (startY: number) => {
		const height = containerRef.current?.clientHeight ?? 1;
		const pairWeight = before.weight + after.weight;
		const minimumWeight = getMinimumWeight();
		let previousY = startY;
		const finishInteraction = beginWorkbenchResize("row-resize");
		const onMove = (event: PointerEvent) => {
			event.preventDefault();
			const deltaWeight = ((event.clientY - previousY) / height) * pairWeight;
			previousY = event.clientY;
			onResize(before.id, after.id, deltaWeight, minimumWeight);
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
			window.removeEventListener("blur", onUp);
			finishInteraction();
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		window.addEventListener("blur", onUp);
	};
	return (
		<WorkbenchDivider
			interactive
			extendHitArea
			orientation="horizontal"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(
				(before.weight / (before.weight + after.weight)) * 100,
			)}
			className="z-20 h-1 w-full shrink-0 cursor-row-resize"
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				event.currentTarget.setPointerCapture?.(event.pointerId);
				startResize(event.clientY);
			}}
			onKeyDown={(event) => {
				if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
				event.preventDefault();
				onResize(
					before.id,
					after.id,
					event.key === "ArrowDown" ? 0.05 : -0.05,
					getMinimumWeight(),
				);
			}}
		/>
	);
}
