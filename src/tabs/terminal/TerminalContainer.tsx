import "./TerminalContainer.scss";
import native from "bridge/native";
import type { AppMenuItem } from "components/AppMenu";
import { showContextMenuForEvent } from "context-menu/service";
import { copyToClipboard, readFromClipboard } from "lib/clipboard";
import keyboard from "lib/keyboard";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
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
	terminalIds?: string[];
	onRename?: () => void | Promise<void>;
	onKill?: () => void | Promise<void>;
}

export default function TerminalContainer({
	activeTerminalId,
	menuItems,
	terminalIds,
	onRename,
	onKill,
}: Props) {
	const { activeTerminals, getTerminalContainer, getXterm } = useShellular();
	const containerRef = useRef<HTMLDivElement>(null);
	const mountedRef = useRef(new Set<string>());
	const activeIdRef = useRef(activeTerminalId);
	useEffect(() => {
		activeIdRef.current = activeTerminalId;
	}, [activeTerminalId]);
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

	const syncActiveTerminalLayout = useEffectEvent(
		(terminalId: string, wasAtBottom: boolean) => {
			fitActive();
			if (wasAtBottom) {
				scrollTerminalToBottom(terminalId);
			}
		},
	);

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

		const scopedTerminals = terminalIds
			? activeTerminals.filter((terminal) =>
					terminalIds.includes(terminal.terminalId),
				)
			: activeTerminals;

		for (const t of scopedTerminals) {
			const termContainer = getTerminalContainer(
				t.terminalId,
			) as TerminalHTMLElement | null;
			if (termContainer && !mountedRef.current.has(t.terminalId)) {
				termContainer.style.display = "none";
				container.appendChild(termContainer);
				mountedRef.current.add(t.terminalId);
			}
		}

		const activeIds = new Set(scopedTerminals.map((t) => t.terminalId));
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
					syncActiveTerminalLayout(activeTerminalId, wasAtBottom);
				});
			});
		}
	}, [activeTerminals, activeTerminalId, terminalIds, getTerminalContainer]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onContextmenu = (event: MouseEvent) => {
			if (process.env.IS_DESKTOP_UI) {
				const xterm = activeIdRef.current
					? getXterm(activeIdRef.current)
					: null;
				if (!xterm) return;
				void showContextMenuForEvent(event, {
					menuId: "terminal",
					target: {
						handlers: {
							"edit.copy": {
								run: () =>
									copyToClipboard({
										text: xterm.getSelection(),
										successMessage: "",
									}),
								enabled: () => xterm.hasSelection(),
							},
							"edit.paste": {
								run: async () => xterm.paste(await readFromClipboard()),
							},
							"edit.selectAll": { run: () => xterm.selectAll() },
							"terminal.clear": { run: () => xterm.clear() },
							"terminal.rename": {
								run: () => onRename?.(),
								visible: Boolean(onRename),
							},
							"terminal.kill": {
								run: () => onKill?.(),
								visible: Boolean(onKill),
							},
						},
					},
				});
				return;
			}
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
	}, [getXterm, onKill, onRename]);

	useEffect(() => {
		const menu = menuRef.current;

		if (!menu || !showContextMenu) return;

		const tabBar = document.querySelector(".tab-bar") as HTMLElement | null;
		const menuW = menu.offsetWidth;
		const menuH = menu.offsetHeight;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const pad = 8;
		const offset = tabBar?.getBoundingClientRect();
		const offsetTop = offset
			? offset.height + (window.innerHeight - offset.bottom)
			: 0;

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

	return (
		<>
			<div
				className="terminal-container"
				onTouchStart={onTouchStart}
				ref={containerRef}
			/>
			{showContextMenu && !process.env.IS_DESKTOP_UI && (
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
