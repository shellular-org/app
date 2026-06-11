import type { ReactNode } from "react";
import "./TabPageHeader.scss";

interface Props {
	title?: string;
	rightSlot?: ReactNode;
	children?: ReactNode;
}

export default function TabPageHeader({ title, rightSlot, children }: Props) {
	return (
		<div className="tab-page-header">
			{children ?? (
				<>
					<span className="tab-page-header-title">{title}</span>
					{rightSlot && (
						<div className="tab-page-header-right">{rightSlot}</div>
					)}
				</>
			)}
		</div>
	);
}
