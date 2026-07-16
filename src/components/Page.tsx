import "./Page.scss";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
	useWorkbenchPageChromeTargets,
	type WorkbenchChromeButton,
} from "../workbench/pageChrome";
import PageHeader from "./PageHeader";

interface Props {
	title: string;
	subtitle?: string;
	rightSlot?: ReactNode;
	titleSlot?: ReactNode;
	desktopTitleSlotInteractive?: boolean;
	children: ReactNode;
	footerSlot?: ReactNode;
	className?: string;
	style?: CSSProperties;
	zIndex?: number;
	noBottomSafeArea?: boolean;
	reverseTruncate?: boolean;
	scrollRef?: React.RefObject<HTMLDivElement | null>;
	desktopNavigationControls?: WorkbenchChromeButton[];
}

export default function Page({
	title,
	subtitle,
	rightSlot,
	titleSlot,
	desktopTitleSlotInteractive = false,
	children,
	footerSlot,
	className,
	style,
	zIndex,
	noBottomSafeArea,
	reverseTruncate = false,
	scrollRef,
	desktopNavigationControls,
}: Props) {
	const workbenchChrome = useWorkbenchPageChromeTargets();
	const renderInWorkbenchChrome = workbenchChrome?.active;

	return (
		<div
			className={`page${noBottomSafeArea ? " no-bottom-safe-area" : ""}${className ? ` ${className}` : ""}`}
			style={{ zIndex, ...style }}
		>
			{renderInWorkbenchChrome ? (
				<>
					{desktopNavigationControls?.length &&
						workbenchChrome.targets.navigation &&
						createPortal(
							<div className="workbench-page-nav-controls">
								{desktopNavigationControls.map((control) => (
									<button
										key={control.id}
										type="button"
										className="workbench-page-chrome-button"
										onClick={control.onClick}
										disabled={control.disabled}
										aria-label={control.label}
										title={control.label}
									>
										<span className={control.icon} aria-hidden="true" />
									</button>
								))}
							</div>,
							workbenchChrome.targets.navigation,
						)}
					{desktopTitleSlotInteractive &&
						titleSlot &&
						workbenchChrome.targets.title &&
						createPortal(
							<div className="workbench-page-title-slot">{titleSlot}</div>,
							workbenchChrome.targets.title,
						)}
					{rightSlot &&
						workbenchChrome.targets.actions &&
						createPortal(
							<div className="workbench-page-actions">{rightSlot}</div>,
							workbenchChrome.targets.actions,
						)}
				</>
			) : (
				<PageHeader
					title={title}
					subtitle={subtitle}
					rightSlot={rightSlot}
					titleSlot={titleSlot}
					reverseTruncate={reverseTruncate}
				/>
			)}
			<div className="page-content" ref={scrollRef}>
				{children}
			</div>
			{footerSlot}
		</div>
	);
}
