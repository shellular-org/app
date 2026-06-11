import native from "bridge/native";
import type { AppMenuItem } from "components/AppMenu";
import keyboard from "lib/keyboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShellular } from "state";
import {
	isAndroidSystemGestureEdge,
	type TerminalHTMLElement,
} from "state/terminals";

interface ContextMenu {
	top: number;
	right: number;
}

interface Props {
	activeTerminalId: string | null;
	menuItems: AppMenuItem[];
}

export default function TerminalContainer({
	activeTerminalId,
	menuItems,
}: Props) {
	const { activeTerminals, getTerminalContainer, getXterm } = useShellular();
	const containerRef = useRef<HTMLDivElement>(null);
	const mountedRef = useRef(new Set<string>());
	const activeIdRef = useRef(activeTerminalId);
	const menuRef = useRef<HTMLDivElement>(null);
	const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenu>({
		top: 0,
		right: 0,
	});
	const [showContextMenu, setShowContextMenu] = useState(false);
	const wasAtBottomRef = useRef<Map<string, boolean>>(new Map());

	const isTerminalAtBottom = useCallback(
		(terminalId: string): boolean => {
			const xterm = getXterm(terminalId);
			if (!xterm) return false;

			try {
				const buffer = xterm.buffer.active;
				const viewportY = xterm.buffer.active.viewportY;
				const baseY = buffer.baseY;
				const cursorY = buffer.cursorY;
				const atBottom = viewportY + xterm.rows >= baseY + cursorY;

				return atBottom;
			} catch {
				return false;
			}
		},
		[getXterm],
	);

	const scrollTerminalToBottom = useCallback(
		(terminalId: string) => {
			const xterm = getXterm(terminalId);
			if (!xterm) return;

			try {
				(
					xterm as unknown as {
						_core: { scrollToBottom: (val: boolean) => void };
					}
				)._core.scrollToBottom(true);
			} catch {}
		},
		[getXterm],
	);

	const fitActive = useCallback(() => {
		const id = activeIdRef.current;
		if (!id) return;
		const termContainer = getTerminalContainer(
			id,
		) as TerminalHTMLElement | null;
		termContainer?.fit?.();
	}, [getTerminalContainer]);

	const onTouchStart = useCallback(
		(event: React.TouchEvent<HTMLDivElement>) => {
			const [touch] = Array.from(event.touches);
			setContextMenuPosition({
				right: window.innerWidth - touch.clientX,
				top: touch.clientY,
			});
		},
		[],
	);

	useEffect(() => {
		const handleKeyboardShow = () => {
			const id = activeIdRef.current;
			if (!id) return;

			const atBottom = isTerminalAtBottom(id);
			wasAtBottomRef.current.set(id, atBottom);
		};

		const handleKeyboardHide = () => {
			const id = activeIdRef.current;
			if (!id) return;

			const atBottom = isTerminalAtBottom(id);
			wasAtBottomRef.current.set(id, atBottom);
		};

		keyboard.on("show", handleKeyboardShow);
		keyboard.on("hide", handleKeyboardHide);

		return () => {
			keyboard.off("show", handleKeyboardShow);
			keyboard.off("hide", handleKeyboardHide);
		};
	}, [isTerminalAtBottom]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const ro = new ResizeObserver(() => {
			const id = activeIdRef.current;
			if (!id) return;
			fitActive();
		});
		ro.observe(container);
		return () => ro.disconnect();
	}, [fitActive]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		for (const t of activeTerminals) {
			const termContainer = getTerminalContainer(
				t.terminalId,
			) as TerminalHTMLElement | null;
			if (termContainer && !mountedRef.current.has(t.terminalId)) {
				termContainer.style.display = "none";
				container.appendChild(termContainer);
				mountedRef.current.add(t.terminalId);
			}
		}

		const activeIds = new Set(activeTerminals.map((t) => t.terminalId));
		for (const id of mountedRef.current) {
			if (!activeIds.has(id)) {
				const termContainer = getTerminalContainer(
					id,
				) as TerminalHTMLElement | null;
				if (termContainer) {
					termContainer.remove();
				}
				mountedRef.current.delete(id);
				wasAtBottomRef.current.delete(id);
			}
		}

		for (const child of container.children) {
			const htmlEl = child as HTMLElement;
			const tid = htmlEl.dataset.terminalId;
			if (tid === activeTerminalId) {
				htmlEl.style.display = "";
			} else {
				htmlEl.style.display = "none";
			}
		}

		if (activeTerminalId) {
			const wasAtBottom = wasAtBottomRef.current.get(activeTerminalId) ?? true;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					fitActive();
					if (wasAtBottom) {
						scrollTerminalToBottom(activeTerminalId);
					}
				});
			});
		}
	}, [
		activeTerminals,
		activeTerminalId,
		getTerminalContainer,
		fitActive,
		scrollTerminalToBottom,
	]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onContextmenu = (event: MouseEvent) => {
			if (event.isTrusted) return;
			event.preventDefault();
			if (isAndroidSystemGestureEdge(event.clientX)) return;
			if (event.clientX || event.clientY) {
				setContextMenuPosition({
					right: window.innerWidth - event.clientX,
					top: event.clientY,
				});
			}
			native.haptic();
			setShowContextMenu(true);
		};
		container.addEventListener("contextmenu", onContextmenu);

		return () => container.removeEventListener("contextmenu", onContextmenu);
	}, []);

	useEffect(() => {
		const menu = menuRef.current;

		if (!menu || !showContextMenu) return;

		const tabBar = document.querySelector(".tab-bar") as HTMLElement;
		const menuW = menu.offsetWidth;
		const menuH = menu.offsetHeight;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const pad = 8;
		const offset = tabBar.getBoundingClientRect();
		const offsetTop = offset.height + (window.innerHeight - offset.bottom);

		let { top, right } = contextMenuPosition;

		if (top + menuH > vh - pad - offsetTop) {
			top = Math.max(pad, vh - menuH - pad - offsetTop);
		}
		if (top < pad) {
			top = pad + offsetTop;
		}
		if (vw - right - menuW < pad) {
			right = Math.max(pad, vw - menuW - pad);
		}
		if (right < pad) {
			right = pad;
		}

		if (
			top !== contextMenuPosition.top ||
			right !== contextMenuPosition.right
		) {
			setContextMenuPosition({ top, right });
		}
	}, [showContextMenu, contextMenuPosition]);

	activeIdRef.current = activeTerminalId;

	return (
		<>
			<div
				className="terminal-container"
				onTouchStart={onTouchStart}
				ref={containerRef}
			/>
			{showContextMenu && (
				<>
					<div
						className="fixed top-0 left-0 h-screen w-screen"
						onClick={() => {
							setContextMenuPosition({ top: 0, right: 0 });
							setShowContextMenu(false);
						}}
					/>
					<div
						ref={menuRef}
						className={`app-menu-dropdown flex flex-col absolute`}
						style={{
							top: `${contextMenuPosition.top}px`,
							right: `${contextMenuPosition.right}px`,
						}}
					>
						{menuItems.map(({ key, label, icon, onClick }) => (
							<button
								key={key || label}
								type="button"
								className="flex"
								onClick={() => {
									setShowContextMenu(false);
									onClick();
								}}
							>
								<span className={icon}></span>
								<span>{label}</span>
							</button>
						))}
					</div>
				</>
			)}
		</>
	);
}
