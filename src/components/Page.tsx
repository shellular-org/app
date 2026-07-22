import "./Page.scss";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
	useWorkbenchPageChromeTargets,
	type WorkbenchChromeButton,
} from "../workbench/pageChrome";
import PageHeader from "./PageHeader";
import PageSecondaryPanelFrame, {
	type PageSecondaryPanel,
} from "./PageSecondaryPanel";

interface Props {
	title: string;
	subtitle?: string;
	rightSlot?: ReactNode;
	titleSlot?: ReactNode;
	toolbarSlot?: ReactNode;
	secondaryPanel?: PageSecondaryPanel;
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
	toolbarSlot,
	secondaryPanel,
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
	const renderInWorkbenchChrome = workbenchChrome?.embedded;

	return (
		<div
			className={`page${noBottomSafeArea ? " no-bottom-safe-area" : ""}${className ? ` ${className}` : ""}`}
			style={{ zIndex, ...style }}
		>
			{renderInWorkbenchChrome ? (
				<>
					{workbenchChrome.visible &&
						desktopNavigationControls?.length &&
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
					{workbenchChrome.visible &&
						rightSlot &&
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
			{toolbarSlot ? <div className="page-toolbar">{toolbarSlot}</div> : null}
			<div className="page-content" ref={scrollRef}>
				{children}
			</div>
			{footerSlot}
			{secondaryPanel && !renderInWorkbenchChrome && (
				<PageSecondaryPanelFrame panel={secondaryPanel} />
			)}
		</div>
	);
}
