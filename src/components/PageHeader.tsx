import "./PageHeader.scss";
import actionStack from "lib/actionStack";
import type { ReactNode } from "react";

interface Props {
	title: string;
	subtitle?: string;
	rightSlot?: ReactNode;
	titleSlot?: ReactNode;
	reverseTruncate?: boolean;
}

export default function PageHeader({
	title,
	subtitle,
	rightSlot,
	titleSlot,
	reverseTruncate = false,
}: Props) {
	return (
		<div
			className={`page-header${subtitle ? " page-header--has-subtitle" : ""}`}
		>
			<button
				type="button"
				className="page-header-back"
				onClick={() => actionStack.pop()}
				aria-label="Back"
			>
				<span className="icon-chevron-left" aria-hidden="true" />
			</button>
			<div className="page-header-title">
				{titleSlot}
				{title && <span className="page-header-title-text">{title}</span>}
				{subtitle && (
					<span
						className="page-header-subtitle"
						dir={reverseTruncate ? "rtl" : "ltr"}
					>
						{subtitle}
					</span>
				)}
			</div>
			<div className="page-header-right">{rightSlot}</div>
		</div>
	);
}
