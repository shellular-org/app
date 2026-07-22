import "./KeyboardToolbar.scss";
import native from "bridge/native";
import { useCallback, useEffect, useRef } from "react";

export type KeyHandler = (e: KeyboardEvent) => void;

interface ModifierState {
	alt: boolean;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
}

interface Props {
	handleKey: KeyHandler;
	modifiers?: ModifierState;
	onHideKeyboard?: () => void;
	swipeLeftPanel?: React.ReactNode;
	swipeLeftOpen?: boolean;
	onSwipeLeftOpen?: () => void;
	onSwipeLeftClose?: () => void;
	keyMap?: Record<keyof typeof KEY_MAP, keyof typeof KEY_MAP>;
	disabledKeys?: string[];
	onDisabledKeyPress?: (key: string) => void;
	rows?: string[][];
}

interface Key {
	label: string;
	icon?: string;
	key: string;
}

const SWIPE_THRESHOLD_RATIO = 0.35;
const HIDE_KB_THRESHOLD = 60;
const IS_DARWIN =
	process.env.IS_IOS || /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);

const KEYS = [
	["esc", "undo", "redo", "home", "up", "end", "pageup"],
	["tab", "ctrl", "alt", "left", "down", "right", "pagedown"],
];

const KEY_MAP: Record<string, Key> = {
	esc: { label: "Esc", key: "Escape" },
	undo: {
		label: "Undo",
		icon: "icon-undo",
		key: IS_DARWIN ? "cmd+z" : "ctrl+z",
	},
	redo: {
		label: "Redo",
		icon: "icon-redo",
		key: IS_DARWIN ? "cmd+shift+z" : "ctrl+shift+z",
	},
	interrupt: { label: "^C", key: "ctrl+c" },
	switchTerminal: {
		label: "Switch terminal",
		icon: "icon-repeat",
		key: "SwitchTerminal",
	},
	del: { label: "Del", key: "Delete" },
	home: { label: "Home", key: "Home" },
	up: { label: "Up", icon: "icon-arrow-up", key: "ArrowUp" },
	end: { label: "End", key: "End" },
	pageup: { label: "PgUp", key: "PageUp" },
	tab: { label: "Tab", key: "Tab" },
	ctrl: { label: "Ctrl", key: "Control" },
	alt: { label: "Alt", key: "Alt" },
	shift: { label: "Shift", key: "Shift" },
	left: { label: "Left", icon: "icon-arrow-left", key: "ArrowLeft" },
	down: { label: "Down", icon: "icon-arrow-down", key: "ArrowDown" },
	right: { label: "Right", icon: "icon-arrow-right", key: "ArrowRight" },
	pagedown: { label: "PgDn", key: "PageDown" },
	meta: {
		label: IS_DARWIN ? "Cmd" : "Meta",
		key: "Meta",
	},
};

export default function KeyboardToolbar({
	modifiers = { ctrl: false, alt: false, meta: false, shift: false },
	handleKey,
	onHideKeyboard,
	swipeLeftPanel,
	onSwipeLeftOpen,
	onSwipeLeftClose,
	swipeLeftOpen = false,
	keyMap = {},
	disabledKeys = [],
	onDisabledKeyPress,
	rows = KEYS,
}: Props) {
	const toolbarRef = useRef<HTMLDivElement>(null);
	const rowsRef = useRef<HTMLDivElement>(null);
	const underlayRef = useRef<HTMLDivElement>(null);
	const swipePanelRef = useRef<HTMLDivElement>(null);
	const touchStartX = useRef(0);
	const touchStartY = useRef(0);
	const touchDelta = useRef(0);
	const isSwiping = useRef(false);
	const swipeDirection = useRef<"left" | "right" | null>(null);
	const hideKbTriggered = useRef(false);
	const isKeyDown = useRef(false);
	const keydownTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	// Publish the accessory bar height so the terminal can pad above it when
	// the keyboard is open (avoids content sliding under the toolbar).
	useEffect(() => {
		const rowsEl = rowsRef.current;
		if (!rowsEl) return;

		const publishHeight = () => {
			const height = Math.ceil(rowsEl.getBoundingClientRect().height);
			if (height > 0) {
				document.documentElement.style.setProperty(
					"--keyboard-toolbar-h",
					`${height}px`,
				);
			}
		};

		publishHeight();
		const observer = new ResizeObserver(publishHeight);
		observer.observe(rowsEl);
		return () => {
			observer.disconnect();
		};
	}, [rows]);

	// Prevent focus loss when clicking buttons
	const preventFocusLoss = (e: React.MouseEvent | React.TouchEvent) => {
		e.preventDefault();
	};

	const handleHideKeyboard = useCallback(() => {
		if (onHideKeyboard) {
			onHideKeyboard();
		} else if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
	}, [onHideKeyboard]);

	const handleTouchStart = useCallback((e: React.TouchEvent) => {
		const touch = e.touches[0];
		touchStartX.current = touch.clientX;
		touchStartY.current = touch.clientY;
		touchDelta.current = 0;
		isSwiping.current = false;
		swipeDirection.current = null;
		hideKbTriggered.current = false;
	}, []);

	const handleTouchMove = useCallback(
		(e: React.TouchEvent) => {
			if (isKeyDown.current) return;
			const touch = e.touches[0];
			const dx = touch.clientX - touchStartX.current;
			const dy = touch.clientY - touchStartY.current;

			// Determine direction on first significant movement
			if (!swipeDirection.current) {
				if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
				if (Math.abs(dy) > Math.abs(dx)) return; // vertical — ignore
				swipeDirection.current = dx < 0 ? "left" : "right";
				isSwiping.current = true;
			}

			if (!isSwiping.current) return;

			const rows = rowsRef.current;
			if (!rows) return;

			if (
				swipeDirection.current === "left" &&
				swipeLeftPanel &&
				!swipeLeftOpen
			) {
				// Swipe left: reveal paste panel
				const delta = Math.max(0, -dx);
				touchDelta.current = delta;
				rows.style.transition = "none";
				rows.style.transform = `translateX(${-delta}px)`;
				const panel = swipePanelRef.current;
				if (panel) {
					panel.style.transition = "none";
					panel.style.transform = `translateX(${-delta}px)`;
				}
			} else if (swipeDirection.current === "right" && swipeLeftOpen) {
				// Swipe right while paste panel is open: slide it back
				const delta = Math.max(0, dx);
				touchDelta.current = delta;
				const panel = swipePanelRef.current;
				if (panel) {
					panel.style.transition = "none";
					panel.style.transform = `translateX(${-100 + (delta / (toolbarRef.current?.offsetWidth || 300)) * 100}%)`;
				}
				if (rows) {
					rows.style.transition = "none";
					rows.style.transform = `translateX(${-100 + (delta / (toolbarRef.current?.offsetWidth || 300)) * 100}%)`;
				}
			} else if (
				swipeDirection.current === "right" &&
				!swipeLeftOpen &&
				onHideKeyboard
			) {
				// Swipe right: reveal hide-keyboard underlay
				const delta = Math.max(0, dx);
				touchDelta.current = delta;
				rows.style.transition = "none";
				rows.style.transform = `translateX(${delta}px)`;

				// Show underlay
				if (underlayRef.current) {
					underlayRef.current.classList.add("visible");
				}

				// Haptic feedback when crossing threshold
				if (delta >= HIDE_KB_THRESHOLD && !hideKbTriggered.current) {
					hideKbTriggered.current = true;
					triggerHaptic();
				} else if (delta < HIDE_KB_THRESHOLD) {
					hideKbTriggered.current = false;
				}
			}
		},
		[swipeLeftPanel, swipeLeftOpen, onHideKeyboard],
	);

	const handleTouchEnd = useCallback(() => {
		const rows = rowsRef.current;
		if (!rows || !isSwiping.current) {
			isSwiping.current = false;
			return;
		}

		rows.style.transition = "";
		rows.style.transform = "";

		// Reset panel style
		const panel = swipePanelRef.current;
		if (panel) {
			panel.style.transition = "";
			panel.style.transform = "";
		}

		// Hide underlay
		if (underlayRef.current) {
			underlayRef.current.classList.remove("visible");
		}

		if (swipeDirection.current === "left" && swipeLeftPanel && !swipeLeftOpen) {
			const width = toolbarRef.current?.offsetWidth || 300;
			if (touchDelta.current > width * SWIPE_THRESHOLD_RATIO) {
				onSwipeLeftOpen?.();
			}
		} else if (swipeDirection.current === "right" && swipeLeftOpen) {
			const width = toolbarRef.current?.offsetWidth || 300;
			if (touchDelta.current > width * SWIPE_THRESHOLD_RATIO) {
				onSwipeLeftClose?.();
			}
		} else if (swipeDirection.current === "right" && !swipeLeftOpen) {
			if (touchDelta.current >= HIDE_KB_THRESHOLD) {
				handleHideKeyboard();
			}
		}

		isSwiping.current = false;
		swipeDirection.current = null;
		touchDelta.current = 0;
	}, [
		swipeLeftPanel,
		swipeLeftOpen,
		onSwipeLeftOpen,
		onSwipeLeftClose,
		handleHideKeyboard,
	]);

	return (
		<div
			className={`keyboard-toolbar ${swipeLeftOpen ? "swipe-left-open" : ""}`}
			ref={toolbarRef}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={handleTouchEnd}
		>
			{/* Hide-keyboard underlay (revealed on swipe right) */}
			{onHideKeyboard && (
				<div className="keyboard-toolbar-hide-underlay" ref={underlayRef}>
					<span className="icon-keyboard_hide" aria-hidden="true" />
				</div>
			)}

			{/* Swipe-left panel (e.g. paste textarea) */}
			{swipeLeftPanel && (
				<div className="keyboard-toolbar-swipe-panel" ref={swipePanelRef}>
					{swipeLeftPanel}
				</div>
			)}

			<div
				className="keyboard-toolbar-rows"
				ref={rowsRef}
				onMouseDown={preventFocusLoss}
				role="toolbar"
				aria-label="Keyboard shortcuts"
				tabIndex={-1}
			>
				{rows.map((row) => (
					<div
						className="keyboard-toolbar-row"
						key={row.join("-")}
						role="presentation"
					>
						{row.map((key) => {
							const mappedKey = keyMap[key] || key;
							const { label, icon } = KEY_MAP[mappedKey] || {};
							const isActive = modifiers[mappedKey as keyof ModifierState];
							const isDisabled =
								disabledKeys.includes(key) || disabledKeys.includes(mappedKey);
							return (
								<button
									type="button"
									key={key}
									className={`keyboard-toolbar-key ${
										isActive ? "active" : ""
									} ${icon ? "icon-button" : ""} ${isDisabled ? "disabled" : ""}`}
									aria-disabled={isDisabled || undefined}
									onTouchStart={() => {
										// Don't use the native `disabled` attribute: it swallows the
										// touch and drops focus from the terminal, closing the
										// keyboard. Instead keep the button live and hand disabled
										// taps to onDisabledKeyPress (which can explain the key via a
										// toast) while preserving focus.
										if (isDisabled) {
											onDisabledKeyPress?.(key);
											return;
										}
										handleKeyDown(
											key,
											mappedKey,
											handleKey,
											isSwiping,
											keydownTimeouts,
										);
									}}
									onTouchCancel={() => {
										const t = keydownTimeouts.current.get(key);
										if (t) clearTimeout(t);
										keydownTimeouts.current.delete(key);
									}}
									aria-label={icon ? label || mappedKey : undefined}
									aria-pressed={isActive || undefined}
								>
									{icon ? (
										<span className={icon} aria-hidden="true" />
									) : (
										label || mappedKey
									)}
								</button>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

function handleKeyDown(
	buttonId: string,
	key: string,
	onKeyDown: KeyHandler,
	isSwiping: React.RefObject<boolean>,
	keydownTimeouts: React.RefObject<Map<string, ReturnType<typeof setTimeout>>>,
) {
	const existing = keydownTimeouts.current.get(buttonId);
	if (existing) clearTimeout(existing);
	const timeout = setTimeout(() => {
		keydownTimeouts.current.delete(buttonId);
		if (isSwiping.current) return;

		const modifiers = KEY_MAP[key]?.key.split("+") || [];
		const mainKey = modifiers.pop();
		const event = new KeyboardEvent("keydown", {
			key: mainKey,
			ctrlKey: modifiers.includes("ctrl"),
			altKey: modifiers.includes("alt"),
			metaKey: modifiers.includes("cmd"),
			shiftKey: modifiers.includes("shift"),
			bubbles: true,
			cancelable: true,
		});
		triggerHaptic();
		onKeyDown(event);
	}, 100);
	keydownTimeouts.current.set(buttonId, timeout);
}

function triggerHaptic() {
	if (process.env.IS_IOS || process.env.IS_ANDROID) {
		try {
			native.haptic();
		} catch (err) {
			console.warn("Failed to trigger native haptic feedback:", err);
		}
	} else if (navigator.vibrate) {
		navigator.vibrate(10);
	}
}
