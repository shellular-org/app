import actionStack from "lib/actionStack";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PageSecondaryPanelController } from "workbench/pageChrome";

export interface PageSecondaryPanel {
	key: string;
	ariaLabel: string;
	title: ReactNode;
	body: ReactNode;
	footer?: ReactNode;
	controller: PageSecondaryPanelController;
}

export default function PageSecondaryPanelFrame({
	panel,
}: {
	panel: PageSecondaryPanel;
}) {
	const { controller } = panel;
	const [mounted, setMounted] = useState(controller.isOpen);
	const closeRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (controller.isOpen) {
			setMounted(true);
			requestAnimationFrame(() => closeRef.current?.focus());
			return;
		}
		const timer = window.setTimeout(() => setMounted(false), 180);
		return () => window.clearTimeout(timer);
	}, [controller.isOpen]);

	useEffect(() => {
		if (!controller.isOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			controller.close();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [controller]);

	useEffect(() => {
		if (!controller.isOpen) return;
		actionStack.push({
			id: controller.panelId,
			action: () => {
				controller.close();
			},
		});
		return () => {
			actionStack.remove(controller.panelId);
		};
	}, [controller]);

	if (!mounted) return null;

	const width = 300;
	const panelContent = (
		<aside
			id={controller.panelId}
			role="dialog"
			aria-label={panel.ariaLabel}
			className="page-secondary-panel page-secondary-panel-mobile relative z-10 flex h-full min-h-0 max-w-[calc(100%-32px)] shrink-0 flex-col overflow-hidden border-r border-line-soft bg-primary text-primary-text shadow-xl"
			style={{ width }}
		>
			<header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line-soft px-2.5">
				<div className="flex min-w-0 items-center gap-2 truncate text-xs font-semibold">
					{panel.title}
				</div>
				<button
					ref={closeRef}
					type="button"
					className="grid size-7 shrink-0 place-items-center rounded text-secondary-text hover:bg-surface-soft hover:text-primary-text focus-visible:outline-2 focus-visible:outline-accent"
					onClick={controller.close}
					aria-label={`Close ${panel.ariaLabel}`}
				>
					<span className="icon-x" aria-hidden="true" />
				</button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto">{panel.body}</div>
			{panel.footer ? (
				<footer className="shrink-0 border-t border-line-soft">
					{panel.footer}
				</footer>
			) : null}
		</aside>
	);

	return (
		<div
			className="page-secondary-panel-overlay pointer-events-auto absolute inset-0 z-[10000] flex overflow-hidden"
			data-state={controller.isOpen ? "open" : "closing"}
		>
			<button
				type="button"
				tabIndex={-1}
				className="page-secondary-panel-backdrop absolute inset-0 border-0 bg-black/35"
				onClick={controller.close}
				aria-label={`Close ${panel.ariaLabel}`}
			/>
			{panelContent}
		</div>
	);
}
