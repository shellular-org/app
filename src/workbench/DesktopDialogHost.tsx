import { useEffect, useRef } from "react";
import SurfaceRenderer from "./SurfaceRenderer";
import { closeWorkbenchDialog } from "./store";
import type { WorkbenchSurface } from "./types";

export default function DesktopDialogHost({
	surface,
}: {
	surface: WorkbenchSurface | null;
}) {
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!surface) return;
		const previous = document.activeElement as HTMLElement | null;
		const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeWorkbenchDialog(surface.id);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("keydown", onKeyDown);
			previous?.focus?.();
		};
	}, [surface]);

	if (!surface) return null;

	return (
		<div
			className="desktop-dialog-backdrop"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget)
					closeWorkbenchDialog(surface.id);
			}}
		>
			<section
				className="desktop-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="desktop-dialog-title"
			>
				<header className="desktop-dialog-titlebar">
					<div className="desktop-dialog-title">
						<span className={surface.icon} aria-hidden="true" />
						<span id="desktop-dialog-title">{surface.title}</span>
					</div>
					<button
						ref={closeButtonRef}
						type="button"
						className="desktop-dialog-close"
						onClick={() => closeWorkbenchDialog(surface.id)}
						aria-label={`Close ${surface.title}`}
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</header>
				<div className="desktop-dialog-body">
					<SurfaceRenderer surface={surface} />
				</div>
			</section>
		</div>
	);
}
