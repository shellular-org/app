import "./ChatDisclosure.scss";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

const disclosureOpenState = new Map<string, boolean>();

export default function ChatDisclosure({
	className,
	summary,
	children,
	defaultOpen = false,
	stateKey,
	showChevron = true,
	lazy = true,
	card = true,
}: {
	className?: string;
	summary: React.ReactNode | ((open: boolean) => React.ReactNode);
	children: React.ReactNode;
	defaultOpen?: boolean;
	stateKey?: string;
	showChevron?: boolean;
	lazy?: boolean;
	card?: boolean;
}) {
	const initialOpen = stateKey
		? (disclosureOpenState.get(stateKey) ?? defaultOpen)
		: defaultOpen;
	const [open, setOpen] = useState(initialOpen);
	const [mounted, setMounted] = useState(initialOpen || !lazy);
	const rootRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const fallbackTimerRef = useRef<number | null>(null);
	const [height, setHeight] = useState(initialOpen ? "auto" : "0px");
	const finishAnimation = useCallback(() => {
		if (fallbackTimerRef.current !== null) {
			window.clearTimeout(fallbackTimerRef.current);
			fallbackTimerRef.current = null;
		}
		if (open) setHeight("auto");
		rootRef.current?.dispatchEvent(
			new CustomEvent("chat-disclosure-animation-end", {
				bubbles: true,
			}),
		);
	}, [open]);

	useEffect(() => {
		return () => {
			if (fallbackTimerRef.current !== null) {
				window.clearTimeout(fallbackTimerRef.current);
			}
		};
	}, []);

	useLayoutEffect(() => {
		const panel = panelRef.current;
		if (!panel) return;
		if (fallbackTimerRef.current !== null) {
			window.clearTimeout(fallbackTimerRef.current);
			fallbackTimerRef.current = null;
		}
		if (open) {
			setHeight(`${panel.scrollHeight}px`);
			fallbackTimerRef.current = window.setTimeout(finishAnimation, 240);
			return;
		}
		const currentHeight = panel.scrollHeight;
		setHeight(`${currentHeight}px`);
		const frame = requestAnimationFrame(() => {
			setHeight("0px");
			fallbackTimerRef.current = window.setTimeout(finishAnimation, 240);
		});
		return () => {
			cancelAnimationFrame(frame);
			if (fallbackTimerRef.current !== null) {
				window.clearTimeout(fallbackTimerRef.current);
				fallbackTimerRef.current = null;
			}
		};
	}, [open, finishAnimation]);

	return (
		<div
			className={`${card ? "chat-part-card" : "chat-disclosure-root"}${
				className ? ` ${className}` : ""
			}`}
			data-open={open ? "true" : "false"}
			ref={rootRef}
		>
			<button
				type="button"
				className="chat-part-card-title chat-disclosure"
				aria-expanded={open}
				onClick={() => {
					rootRef.current?.dispatchEvent(
						new CustomEvent("chat-disclosure-animation-start", {
							bubbles: true,
						}),
					);
					if (!mounted) setMounted(true);
					setOpen((value) => {
						const nextOpen = !value;
						if (stateKey) disclosureOpenState.set(stateKey, nextOpen);
						return nextOpen;
					});
				}}
			>
				{typeof summary === "function" ? summary(open) : summary}
				{showChevron && (
					<em>
						<span className={`icon-chevron-${open ? "up" : "down"}`} />
					</em>
				)}
			</button>
			<div
				className="chat-disclosure-panel"
				ref={panelRef}
				style={{ height }}
				aria-hidden={!open}
				onTransitionEnd={(event) => {
					if (event.target !== event.currentTarget) return;
					finishAnimation();
				}}
				onTransitionCancel={(event) => {
					if (event.target !== event.currentTarget) return;
					finishAnimation();
				}}
			>
				<div className="chat-disclosure-panel-inner">
					{mounted ? children : null}
				</div>
			</div>
		</div>
	);
}
