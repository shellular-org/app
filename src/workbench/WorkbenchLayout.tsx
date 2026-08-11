import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	TouchSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import native from "bridge/native";
import clsx from "clsx";
import { showContextMenuForEvent } from "context-menu/service";
import { copyToClipboard } from "lib/clipboard";
import { redirectVerticalWheelToHorizontal } from "lib/horizontalWheel";
import {
	type CSSProperties,
	type MouseEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getConnectionSnapshot } from "state/connection";
import {
	findParentWorkbenchSplit,
	findWorkbenchGroup,
	findWorkbenchTab,
	type SplitDirection,
	workbenchGroups,
	workbenchMinimumSize,
} from "./layoutTree";
import { ShellularFileIcon } from "./ShellularFileIcon";
import {
	activateWorkbenchSurface,
	focusWorkbenchGroup,
	moveWorkbenchSurface,
	persistWorkbenchSnapshot,
	resizeWorkbenchLayoutSplit,
	setWorkbenchSurfacePinned,
	splitWorkbenchSurface,
} from "./store";
import type {
	WorkbenchGroupNode,
	WorkbenchLayoutNode,
	WorkbenchSnapshot,
	WorkbenchSplitNode,
	WorkbenchSurface,
} from "./types";
import WorkbenchDivider from "./WorkbenchDivider";
import WorkbenchSurfaceDeck, {
	type WorkbenchPaneTargets,
} from "./WorkbenchSurfaceDeck";

type DropZone = "center" | SplitDirection;
const MOVE_TO_PANE_EVENT = "shellular:workbench-move-to-pane";

interface WorkbenchLayoutProps {
	snapshot: WorkbenchSnapshot;
	compact: boolean;
	surfaceTitle: (surface: WorkbenchSurface) => string;
	renderSurface: (surface: WorkbenchSurface) => ReactNode;
	renderWelcome: () => ReactNode;
	onCloseSurface: (surface: WorkbenchSurface) => Promise<boolean>;
	onCloseSurfaces: (
		surfaces: WorkbenchSurface[],
		reason: "pane" | "tile-group" | "bulk",
	) => Promise<boolean>;
}

const collisionDetection: CollisionDetection = (args) => {
	const hits = pointerWithin(args);
	if (hits.length === 0) return closestCenter(args);
	return [...hits].sort((left, right) => {
		const leftTab = String(left.id).startsWith("tab:");
		const rightTab = String(right.id).startsWith("tab:");
		return leftTab === rightTab ? 0 : leftTab ? -1 : 1;
	});
};

export default function WorkbenchLayout({
	snapshot,
	compact,
	surfaceTitle,
	renderSurface,
	renderWelcome,
	onCloseSurface,
	onCloseSurfaces,
}: WorkbenchLayoutProps) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 180, tolerance: 6 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [moveToPaneId, setMoveToPaneId] = useState<string | null>(null);
	const [dropMessage, setDropMessage] = useState("");
	const [targetsByGroup, setTargetsByGroup] = useState<
		ReadonlyMap<string, WorkbenchPaneTargets>
	>(new Map());
	const surfaceMap = useMemo(
		() => new Map(snapshot.surfaces.map((surface) => [surface.id, surface])),
		[snapshot.surfaces],
	);
	const groups = useMemo(() => workbenchGroups(snapshot.root), [snapshot.root]);
	const renderedRoot = compact
		? (findWorkbenchGroup(snapshot.root, snapshot.focusedGroupId) ?? groups[0])
		: snapshot.root;
	const draggedSurface = draggedId ? surfaceMap.get(draggedId) : null;

	useEffect(() => {
		const requestMove = (event: Event) => {
			const id = (event as CustomEvent<string>).detail;
			if (typeof id === "string") setMoveToPaneId(id);
		};
		window.addEventListener(MOVE_TO_PANE_EVENT, requestMove);
		return () => window.removeEventListener(MOVE_TO_PANE_EVENT, requestMove);
	}, []);

	useEffect(() => {
		document.documentElement.classList.toggle(
			"workbench-is-dragging",
			Boolean(draggedId),
		);
		return () =>
			document.documentElement.classList.remove("workbench-is-dragging");
	}, [draggedId]);

	const registerTargets = useCallback(
		(groupId: string, targets: WorkbenchPaneTargets | null) => {
			setTargetsByGroup((current) => {
				if (targets && current.get(groupId) === targets) return current;
				if (!targets && !current.has(groupId)) return current;
				const next = new Map(current);
				if (targets) next.set(groupId, targets);
				else next.delete(groupId);
				return next;
			});
		},
		[],
	);

	const onDragStart = useCallback((event: DragStartEvent) => {
		const id = event.active.data.current?.surfaceId;
		setDraggedId(typeof id === "string" ? id : null);
		setDropMessage(
			id ? `Moving ${event.active.data.current?.title ?? "tab"}` : "",
		);
	}, []);

	const onDragOver = useCallback((event: DragOverEvent) => {
		const data = event.over?.data.current;
		if (!data) {
			setDropMessage("No drop target");
			return;
		}
		if (data.valid === false) {
			setDropMessage(String(data.reason ?? "This drop is unavailable"));
			return;
		}
		const label = data.zone === "center" ? "pane" : `${data.zone} split`;
		setDropMessage(`Drop in ${label}`);
	}, []);

	const finishDrag = useCallback(() => {
		setDraggedId(null);
		setDropMessage("");
	}, []);
	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const surfaceId = event.active.data.current?.surfaceId;
			const over = event.over?.data.current;
			if (typeof surfaceId === "string" && over?.valid !== false) {
				if (over?.type === "tab" && typeof over.groupId === "string") {
					moveWorkbenchSurface(surfaceId, over.groupId, Number(over.index));
				} else if (over?.type === "pane" && typeof over.groupId === "string") {
					if (over.zone === "center") {
						moveWorkbenchSurface(surfaceId, over.groupId);
					} else if (
						over.zone === "left" ||
						over.zone === "right" ||
						over.zone === "up" ||
						over.zone === "down"
					) {
						splitWorkbenchSurface(surfaceId, over.groupId, over.zone);
					}
				}
			}
			finishDrag();
		},
		[finishDrag],
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionDetection}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragCancel={finishDrag}
			onDragEnd={onDragEnd}
		>
			<div className="relative flex size-full min-h-0 min-w-0 flex-col overflow-hidden">
				{compact && groups.length > 1 && (
					<label className="flex h-9 shrink-0 items-center gap-2 border-b border-card-border bg-secondary px-2 text-xs text-secondary-text">
						<span className="icon-columns" aria-hidden="true" />
						<span>Pane</span>
						<select
							className="min-w-0 flex-1 bg-transparent text-primary-text outline-none"
							aria-label="Switch pane"
							value={snapshot.focusedGroupId}
							onChange={(event) => focusWorkbenchGroup(event.target.value)}
						>
							{groups.map((group, index) => {
								const active = group.activeId
									? surfaceMap.get(group.activeId)
									: null;
								return (
									<option key={group.id} value={group.id}>
										{index + 1}. {active ? surfaceTitle(active) : "Empty"} (
										{group.tabs.length})
									</option>
								);
							})}
						</select>
					</label>
				)}
				{renderedRoot && (
					<LayoutNodeView
						node={renderedRoot}
						snapshot={snapshot}
						compact={compact}
						draggedId={draggedId}
						surfaceMap={surfaceMap}
						surfaceTitle={surfaceTitle}
						renderWelcome={renderWelcome}
						registerTargets={registerTargets}
						onCloseSurface={onCloseSurface}
						onCloseSurfaces={onCloseSurfaces}
					/>
				)}
				<WorkbenchSurfaceDeck
					snapshot={snapshot}
					compact={compact}
					targetsByGroup={targetsByGroup}
					renderSurface={renderSurface}
				/>
				<div className="sr-only" aria-live="assertive" aria-atomic="true">
					{dropMessage}
				</div>
				{moveToPaneId && (
					<MoveToPaneDialog
						surfaceId={moveToPaneId}
						snapshot={snapshot}
						surfaceMap={surfaceMap}
						surfaceTitle={surfaceTitle}
						onClose={() => setMoveToPaneId(null)}
					/>
				)}
			</div>
			<DragOverlay dropAnimation={null}>
				{draggedSurface ? (
					<div className="max-w-56 rounded border border-accent bg-secondary px-3 py-2 text-xs text-primary-text shadow-xl">
						{surfaceTitle(draggedSurface)}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

function MoveToPaneDialog({
	surfaceId,
	snapshot,
	surfaceMap,
	surfaceTitle,
	onClose,
}: {
	surfaceId: string;
	snapshot: WorkbenchSnapshot;
	surfaceMap: ReadonlyMap<string, WorkbenchSurface>;
	surfaceTitle: (surface: WorkbenchSurface) => string;
	onClose: () => void;
}) {
	const source = findWorkbenchTab(snapshot.root, surfaceId);
	const firstTargetRef = useRef<HTMLButtonElement>(null);
	const targets = workbenchGroups(snapshot.root).filter(
		(group) => group.id !== source?.group.id,
	);
	useEffect(() => firstTargetRef.current?.focus(), []);
	return (
		<div
			className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="move-to-pane-title"
				className="w-full max-w-sm rounded-lg border border-card-border bg-secondary p-3 shadow-2xl"
			>
				<div className="mb-2 flex items-center justify-between gap-3">
					<h2
						id="move-to-pane-title"
						className="text-sm font-semibold text-primary-text"
					>
						Move to Pane
					</h2>
					<button
						type="button"
						className="grid size-7 place-items-center rounded hover:bg-surface-soft"
						aria-label="Cancel move"
						onClick={onClose}
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</div>
				<div className="grid gap-1">
					{targets.map((group, index) => {
						const active = group.activeId
							? surfaceMap.get(group.activeId)
							: null;
						return (
							<button
								ref={index === 0 ? firstTargetRef : undefined}
								key={group.id}
								type="button"
								className="flex items-center justify-between gap-3 rounded px-3 py-2 text-left text-xs text-primary-text hover:bg-surface-soft"
								onClick={() => {
									moveWorkbenchSurface(surfaceId, group.id);
									onClose();
								}}
							>
								<span className="truncate">
									{active ? surfaceTitle(active) : "Empty pane"}
								</span>
								<span className="text-secondary-text">
									{group.tabs.length} tabs
								</span>
							</button>
						);
					})}
					{targets.length === 0 && (
						<p className="px-3 py-4 text-center text-xs text-secondary-text">
							There is no other pane yet. Split this tab first.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

interface NodeViewProps {
	node: WorkbenchLayoutNode;
	snapshot: WorkbenchSnapshot;
	compact: boolean;
	draggedId: string | null;
	surfaceMap: ReadonlyMap<string, WorkbenchSurface>;
	surfaceTitle: (surface: WorkbenchSurface) => string;
	renderWelcome: () => ReactNode;
	registerTargets: (id: string, targets: WorkbenchPaneTargets | null) => void;
	onCloseSurface: (surface: WorkbenchSurface) => Promise<boolean>;
	onCloseSurfaces: (
		surfaces: WorkbenchSurface[],
		reason: "pane" | "tile-group" | "bulk",
	) => Promise<boolean>;
}

function LayoutNodeView(props: NodeViewProps) {
	if (props.node.type === "group") {
		return <PaneView {...props} group={props.node} />;
	}
	return <SplitView {...props} split={props.node} />;
}

function SplitView({
	split,
	...props
}: NodeViewProps & { split: WorkbenchSplitNode }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const horizontal = split.orientation === "horizontal";
	return (
		<div
			ref={containerRef}
			className={clsx(
				"flex size-full min-h-0 min-w-0 overflow-hidden",
				horizontal ? "flex-row" : "flex-col",
			)}
		>
			<div
				className="min-h-0 min-w-0 overflow-hidden"
				style={{ flex: `0 0 calc(${split.ratio * 100}% - 2px)` }}
			>
				<LayoutNodeView {...props} node={split.first} />
			</div>
			<WorkbenchSash split={split} containerRef={containerRef} />
			<div className="min-h-0 min-w-0 flex-1 overflow-hidden">
				<LayoutNodeView {...props} node={split.second} />
			</div>
		</div>
	);
}

function WorkbenchSash({
	split,
	containerRef,
}: {
	split: WorkbenchSplitNode;
	containerRef: React.RefObject<HTMLDivElement | null>;
}) {
	const horizontal = split.orientation === "horizontal";
	const resizingRef = useRef(false);
	const frameRef = useRef<number | null>(null);
	const pendingRatioRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			document.documentElement.classList.remove("workbench-is-resizing");
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		},
		[],
	);

	const clampRatio = useCallback(
		(requested: number) => {
			const container = containerRef.current;
			if (!container) return split.ratio;
			const rect = container.getBoundingClientRect();
			const total = horizontal ? rect.width : rect.height;
			if (total <= 0) return Math.max(0.1, Math.min(0.9, requested));
			const firstMin = workbenchMinimumSize(split.first);
			const secondMin = workbenchMinimumSize(split.second);
			const min = (horizontal ? firstMin.width : firstMin.height) / total;
			const max = 1 - (horizontal ? secondMin.width : secondMin.height) / total;
			if (min > max) return split.ratio;
			return Math.max(min, Math.min(max, requested));
		},
		[containerRef, horizontal, split],
	);
	const constrainedRatio = useCallback(
		(clientX: number, clientY: number) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return split.ratio;
			const total = horizontal ? rect.width : rect.height;
			if (total <= 0) return split.ratio;
			const pointer = horizontal ? clientX - rect.left : clientY - rect.top;
			return clampRatio(pointer / total);
		},
		[clampRatio, containerRef, horizontal, split.ratio],
	);
	const applyPendingResize = useCallback(() => {
		frameRef.current = null;
		const ratio = pendingRatioRef.current;
		pendingRatioRef.current = null;
		if (ratio !== null) {
			resizeWorkbenchLayoutSplit(split.id, ratio, { persist: false });
		}
	}, [split.id]);

	const finish = useCallback(() => {
		if (!resizingRef.current) return;
		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		applyPendingResize();
		resizingRef.current = false;
		document.documentElement.classList.remove("workbench-is-resizing");
		persistWorkbenchSnapshot();
	}, [applyPendingResize]);

	return (
		<WorkbenchDivider
			interactive
			extendHitArea
			orientation={horizontal ? "vertical" : "horizontal"}
			aria-label={`Resize ${horizontal ? "columns" : "rows"}`}
			aria-valuemin={10}
			aria-valuemax={90}
			aria-valuenow={Math.round(split.ratio * 100)}
			className={clsx(
				"workbench-layout-sash z-20 shrink-0 touch-none",
				horizontal
					? "h-full w-1 cursor-col-resize"
					: "h-1 w-full cursor-row-resize",
			)}
			onDoubleClick={() =>
				resizeWorkbenchLayoutSplit(split.id, clampRatio(0.5))
			}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				resizingRef.current = true;
				event.currentTarget.setPointerCapture?.(event.pointerId);
				document.documentElement.classList.add("workbench-is-resizing");
				document.documentElement.style.setProperty(
					"--workbench-resize-cursor",
					horizontal ? "col-resize" : "row-resize",
				);
			}}
			onPointerMove={(event) => {
				if (!resizingRef.current) return;
				pendingRatioRef.current = constrainedRatio(
					event.clientX,
					event.clientY,
				);
				if (frameRef.current === null) {
					frameRef.current = requestAnimationFrame(applyPendingResize);
				}
			}}
			onPointerUp={finish}
			onPointerCancel={finish}
			onKeyDown={(event) => {
				const backward = horizontal ? "ArrowLeft" : "ArrowUp";
				const forward = horizontal ? "ArrowRight" : "ArrowDown";
				if (
					event.key !== backward &&
					event.key !== forward &&
					event.key !== "Home"
				)
					return;
				event.preventDefault();
				const next =
					event.key === "Home"
						? 0.5
						: split.ratio + (event.key === forward ? 0.02 : -0.02);
				resizeWorkbenchLayoutSplit(split.id, clampRatio(next));
			}}
		/>
	);
}

function PaneView({
	group,
	snapshot,
	compact,
	draggedId,
	surfaceMap,
	surfaceTitle,
	renderWelcome,
	registerTargets,
	onCloseSurface,
	onCloseSurfaces,
}: NodeViewProps & { group: WorkbenchGroupNode }) {
	const bodyRef = useRef<HTMLDivElement>(null);
	const actionsRef = useRef<HTMLDivElement>(null);
	const navigationRef = useRef<HTMLDivElement>(null);
	const paneRef = useRef<HTMLFieldSetElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const hasTabs = group.tabs.length > 0;
	const focused = group.id === snapshot.focusedGroupId;
	useLayoutEffect(() => {
		const targets = {
			body: bodyRef.current,
			actions: hasTabs ? actionsRef.current : null,
			navigation: hasTabs ? navigationRef.current : null,
		};
		registerTargets(group.id, targets);
		return () => registerTargets(group.id, null);
	}, [
		group.id,
		focused,
		hasTabs,
		registerTargets,
	]);

	useLayoutEffect(() => {
		const pane = paneRef.current;
		if (!pane) return;
		const measure = () => {
			const rect = pane.getBoundingClientRect();
			setSize((current) =>
				current.width === rect.width && current.height === rect.height
					? current
					: { width: rect.width, height: rect.height },
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(pane);
		return () => observer.disconnect();
	}, []);

	const active = group.activeId ? surfaceMap.get(group.activeId) : null;
	const splitAvailability = {
		horizontal: size.width >= 484,
		vertical: size.height >= 324,
	};
	const closeCaptured = useCallback(
		(ids: string[], reason: "pane" | "tile-group" | "bulk") =>
			onCloseSurfaces(
				ids
					.map((id) => surfaceMap.get(id))
					.filter((surface): surface is WorkbenchSurface => Boolean(surface)),
				reason,
			),
		[onCloseSurfaces, surfaceMap],
	);

	return (
		<fieldset
			ref={paneRef}
			className={clsx(
				"workbench-pane relative m-0 flex size-full min-h-0 min-w-0 flex-col overflow-hidden border-0 bg-primary p-0",
				focused && "is-focused",
			)}
			aria-current={focused ? "true" : undefined}
			onFocusCapture={() => focusWorkbenchGroup(group.id)}
			onPointerDownCapture={() => focusWorkbenchGroup(group.id)}
		>
			<legend className="sr-only">
				Pane with {group.tabs.length} {group.tabs.length === 1 ? "tab" : "tabs"}
			</legend>
			{hasTabs && (
				<div className="workbench-tab-strip">
					<div
						className="workbench-tabs-scroll"
						role="tablist"
						aria-label={`Open views in pane ${group.id}`}
						onWheel={redirectVerticalWheelToHorizontal}
					>
						<SortableContext
							items={group.tabs.map((tab) => `tab:${tab.surfaceId}`)}
							strategy={horizontalListSortingStrategy}
						>
							{group.tabs.map((tab, index) => {
								const surface = surfaceMap.get(tab.surfaceId);
								if (!surface) return null;
								return (
									<SortableWorkbenchTab
										key={surface.id}
										group={group}
										index={index}
										tabPinned={tab.pinned}
										surface={surface}
										title={surfaceTitle(surface)}
										snapshot={snapshot}
										splitAvailability={splitAvailability}
										onCloseSurface={onCloseSurface}
										onCloseSurfaces={closeCaptured}
									/>
								);
							})}
						</SortableContext>
					</div>
					<div className="workbench-page-nav-slot" ref={navigationRef} />
					<div className="workbench-page-actions-target" ref={actionsRef} />
					{active && (
						<button
							type="button"
							className="workbench-tabbar-icon-button shrink-0 text-secondary-text hover:text-primary-text"
							aria-label="Pane actions"
							title="Pane actions"
							onClick={(event) =>
								showTabContextMenu(event, {
									group,
									surface: active,
									snapshot,
									splitAvailability,
									onCloseSurface,
									onCloseSurfaces: closeCaptured,
								})
							}
						>
							<span className="icon-more-horizontal" aria-hidden="true" />
						</button>
					)}
				</div>
			)}
			<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
				<div
					ref={bodyRef}
					className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
				>
					{!hasTabs && renderWelcome()}
				</div>
			</div>
			{draggedId && (
				<PaneDropTargets
					group={group}
					activeSurfaceId={draggedId}
					compact={compact}
					size={size}
				/>
			)}
		</fieldset>
	);
}

function SortableWorkbenchTab({
	group,
	index,
	tabPinned,
	surface,
	title,
	snapshot,
	splitAvailability,
	onCloseSurface,
	onCloseSurfaces,
}: {
	group: WorkbenchGroupNode;
	index: number;
	tabPinned: boolean;
	surface: WorkbenchSurface;
	title: string;
	snapshot: WorkbenchSnapshot;
	splitAvailability: { horizontal: boolean; vertical: boolean };
	onCloseSurface: (surface: WorkbenchSurface) => Promise<boolean>;
	onCloseSurfaces: (
		ids: string[],
		reason: "pane" | "tile-group" | "bulk",
	) => Promise<boolean>;
}) {
	const active = group.activeId === surface.id;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: `tab:${surface.id}`,
		data: {
			type: "tab",
			surfaceId: surface.id,
			groupId: group.id,
			index,
			title,
		},
	});
	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={clsx(
				"workbench-tab",
				active && "active",
				surface.dirty && "is-dirty",
				tabPinned && "is-pinned",
				isDragging && "opacity-30",
			)}
			onContextMenu={(event) =>
				showTabContextMenu(event, {
					group,
					surface,
					snapshot,
					splitAvailability,
					onCloseSurface,
					onCloseSurfaces,
				})
			}
		>
			<button
				{...attributes}
				{...listeners}
				type="button"
				role="tab"
				aria-selected={active}
				aria-controls={`workbench-surface-${surface.id}`}
				aria-label={title}
				aria-description={`${tabPinned ? "Pinned" : "Unpinned"}${surface.dirty ? ", unsaved changes" : ""}`}
				title={tabPinned ? `${title} (Pinned)` : title}
				onClick={() => activateWorkbenchSurface(surface.id)}
			>
				{surface.kind === "editor" ? (
					<ShellularFileIcon
						path={surface.filePath}
						className="workbench-file-icon size-4 shrink-0"
					/>
				) : (
					<span className={surface.icon} aria-hidden="true" />
				)}
				{!tabPinned && <span>{title}</span>}
				{tabPinned && surface.dirty && (
					<span className="workbench-pinned-dirty" aria-hidden="true" />
				)}
			</button>
			<button
				type="button"
				className="workbench-tab-close"
				aria-label={`Close ${title}`}
				aria-hidden={!active}
				tabIndex={active ? 0 : -1}
				onClick={() => void onCloseSurface(surface)}
			>
				{surface.dirty ? (
					<>
						<span className="workbench-tab-dirty-icon icon-circle" />
						<span className="workbench-tab-dirty-close icon-x" />
					</>
				) : (
					<span className="icon-x" />
				)}
			</button>
		</div>
	);
}

function showTabContextMenu(
	event: MouseEvent,
	{
		group,
		surface,
		snapshot,
		splitAvailability,
		onCloseSurface,
		onCloseSurfaces,
	}: {
		group: WorkbenchGroupNode;
		surface: WorkbenchSurface;
		snapshot: WorkbenchSnapshot;
		splitAvailability: { horizontal: boolean; vertical: boolean };
		onCloseSurface: (surface: WorkbenchSurface) => Promise<boolean>;
		onCloseSurfaces: (
			ids: string[],
			reason: "pane" | "tile-group" | "bulk",
		) => Promise<boolean>;
	},
) {
	const index = group.tabs.findIndex((tab) => tab.surfaceId === surface.id);
	const currentTab = group.tabs[index];
	const soleSelfTab =
		group.tabs.length === 1 && currentTab?.surfaceId === surface.id;
	const unpinnedOthers = group.tabs
		.filter((tab) => !tab.pinned && tab.surfaceId !== surface.id)
		.map((tab) => tab.surfaceId);
	const unpinnedRight = group.tabs
		.slice(index + 1)
		.filter((tab) => !tab.pinned)
		.map((tab) => tab.surfaceId);
	const unpinnedAll = group.tabs
		.filter((tab) => !tab.pinned)
		.map((tab) => tab.surfaceId);
	const groups = workbenchGroups(snapshot.root);
	const parent = findParentWorkbenchSplit(snapshot.root, group.id);
	const tileIds = parent
		? parent.first.type === "group" && parent.first.id === group.id
			? [
					...parent.first.tabs.map((tab) => tab.surfaceId),
					...collectNodeIds(parent.second),
				]
			: collectNodeIds(parent)
		: collectNodeIds(snapshot.root);
	const path = surface.kind === "editor" ? surface.filePath : null;

	void showContextMenuForEvent(event, {
		menuId: "workbench-tab",
		target: {
			handlers: {
				"tab.pin": {
					run: () => setWorkbenchSurfacePinned(surface.id, true),
					visible: !currentTab?.pinned,
				},
				"tab.unpin": {
					run: () => setWorkbenchSurfacePinned(surface.id, false),
					visible: Boolean(currentTab?.pinned),
				},
				"tab.moveToPane": {
					run: () =>
						window.dispatchEvent(
							new CustomEvent(MOVE_TO_PANE_EVENT, { detail: surface.id }),
						),
					enabled: groups.length > 1,
				},
				"tab.splitLeft": {
					run: () => splitWorkbenchSurface(surface.id, group.id, "left"),
					enabled: splitAvailability.horizontal && !soleSelfTab,
				},
				"tab.splitRight": {
					run: () => splitWorkbenchSurface(surface.id, group.id, "right"),
					enabled: splitAvailability.horizontal && !soleSelfTab,
				},
				"tab.splitUp": {
					run: () => splitWorkbenchSurface(surface.id, group.id, "up"),
					enabled: splitAvailability.vertical && !soleSelfTab,
				},
				"tab.splitDown": {
					run: () => splitWorkbenchSurface(surface.id, group.id, "down"),
					enabled: splitAvailability.vertical && !soleSelfTab,
				},
				"tab.close": { run: () => onCloseSurface(surface) },
				"tab.closeOthers": {
					run: () => onCloseSurfaces(unpinnedOthers, "bulk"),
					enabled: unpinnedOthers.length > 0,
				},
				"tab.closeRight": {
					run: () => onCloseSurfaces(unpinnedRight, "bulk"),
					enabled: unpinnedRight.length > 0,
				},
				"tab.closeAll": {
					run: () => onCloseSurfaces(unpinnedAll, "bulk"),
					enabled: unpinnedAll.length > 0,
				},
				"pane.close": {
					run: () =>
						onCloseSurfaces(
							group.tabs.map((tab) => tab.surfaceId),
							"pane",
						),
					enabled: group.tabs.length > 0,
				},
				"pane.closeTileGroup": {
					run: () => onCloseSurfaces(tileIds, "tile-group"),
					enabled: tileIds.length > 0,
				},
				"resource.copyPath": {
					run: () => path && copyToClipboard({ text: path }),
					visible: Boolean(path),
				},
				"resource.reveal": {
					run: () => path && native.revealLocalPath(path),
					visible: Boolean(
						path && getConnectionSnapshot().transport === "local",
					),
				},
			},
		},
	});
}

function collectNodeIds(node: WorkbenchLayoutNode): string[] {
	if (node.type === "group") return node.tabs.map((tab) => tab.surfaceId);
	return [...collectNodeIds(node.first), ...collectNodeIds(node.second)];
}

function PaneDropTargets({
	group,
	activeSurfaceId,
	compact,
	size,
}: {
	group: WorkbenchGroupNode;
	activeSurfaceId: string;
	compact: boolean;
	size: { width: number; height: number };
}) {
	const sameSoleTab =
		group.tabs.length === 1 && group.tabs[0]?.surfaceId === activeSurfaceId;
	const horizontalPossible = size.width >= 484;
	const verticalPossible = size.height >= 324;
	return (
		<div
			className="pointer-events-none absolute inset-0 z-40"
			aria-hidden="true"
		>
			<DropTarget groupId={group.id} zone="center" valid />
			{!compact && (
				<>
					<DropTarget
						groupId={group.id}
						zone="left"
						valid={horizontalPossible && !sameSoleTab}
						reason={
							sameSoleTab
								? "A pane cannot split its only tab into itself"
								: "Pane is too narrow to split"
						}
					/>
					<DropTarget
						groupId={group.id}
						zone="right"
						valid={horizontalPossible && !sameSoleTab}
						reason={
							sameSoleTab
								? "A pane cannot split its only tab into itself"
								: "Pane is too narrow to split"
						}
					/>
					<DropTarget
						groupId={group.id}
						zone="up"
						valid={verticalPossible && !sameSoleTab}
						reason={
							sameSoleTab
								? "A pane cannot split its only tab into itself"
								: "Pane is too short to split"
						}
					/>
					<DropTarget
						groupId={group.id}
						zone="down"
						valid={verticalPossible && !sameSoleTab}
						reason={
							sameSoleTab
								? "A pane cannot split its only tab into itself"
								: "Pane is too short to split"
						}
					/>
				</>
			)}
		</div>
	);
}

function DropTarget({
	groupId,
	zone,
	valid,
	reason,
}: {
	groupId: string;
	zone: DropZone;
	valid: boolean;
	reason?: string;
}) {
	const { isOver, setNodeRef } = useDroppable({
		id: `drop:${groupId}:${zone}`,
		data: { type: "pane", groupId, zone, valid, reason },
	});
	return (
		<div
			ref={setNodeRef}
			className={clsx(
				"pointer-events-auto absolute",
				zone === "center" && "inset-[25%] min-h-20 min-w-20",
				zone === "left" && "inset-y-0 left-0 w-[max(25%,80px)]",
				zone === "right" && "inset-y-0 right-0 w-[max(25%,80px)]",
				zone === "up" && "inset-x-0 top-0 h-[max(25%,80px)]",
				zone === "down" && "inset-x-0 bottom-0 h-[max(25%,80px)]",
			)}
			data-drop-zone={zone}
			data-valid={valid}
		>
			{isOver && (
				<span
					className={clsx(
						"pointer-events-none absolute transition-colors duration-100 motion-reduce:transition-none",
						valid ? "bg-accent/20" : "bg-red-500/15",
						zone === "center" && "inset-[-50%]",
						zone === "left" && "inset-y-0 left-0 w-[200%]",
						zone === "right" && "inset-y-0 right-0 w-[200%]",
						zone === "up" && "inset-x-0 top-0 h-[200%]",
						zone === "down" && "inset-x-0 bottom-0 h-[200%]",
					)}
				/>
			)}
		</div>
	);
}
