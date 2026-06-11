import "./Page.scss";
import type { CSSProperties, ReactNode } from "react";
import PageHeader from "./PageHeader";

interface Props {
	title: string;
	subtitle?: string;
	rightSlot?: ReactNode;
	titleSlot?: ReactNode;
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	zIndex?: number;
	noBottomSafeArea?: boolean;
	reverseTruncate?: boolean;
	scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export default function Page({
	title,
	subtitle,
	rightSlot,
	titleSlot,
	children,
	className,
	style,
	zIndex,
	noBottomSafeArea,
	reverseTruncate = false,
	scrollRef,
}: Props) {
	return (
		<div
			className={`page${noBottomSafeArea ? " no-bottom-safe-area" : ""}${className ? ` ${className}` : ""}`}
			style={{ zIndex, ...style }}
		>
			<PageHeader
				title={title}
				subtitle={subtitle}
				rightSlot={rightSlot}
				titleSlot={titleSlot}
				reverseTruncate={reverseTruncate}
			/>
			<div className="page-content" ref={scrollRef}>
				{children}
			</div>
		</div>
	);
}
