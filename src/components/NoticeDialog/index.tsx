import type { Notice } from "lib/notices";
import { useCallback } from "react";
import "./style.scss";

interface NoticeDialogProps {
	notice: Notice | null;
	onDismiss: (id: string) => void;
}

export default function NoticeDialog({ notice, onDismiss }: NoticeDialogProps) {
	const handleDismiss = useCallback(() => {
		if (notice) onDismiss(notice.id);
	}, [notice, onDismiss]);

	if (!notice) {
		return null;
	}

	return (
		<div className="notice-dialog-overlay">
			<div className="notice-dialog">
				<div className="notice-dialog-header">
					<h2 className="notice-dialog-title">{notice.title}</h2>
					<button
						type="button"
						className="notice-dialog-close"
						onClick={handleDismiss}
						aria-label="Close"
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</div>
				<p className="notice-dialog-message">{notice.body}</p>
				<div className="notice-dialog-actions">
					<button
						type="button"
						className="notice-dialog-button notice-dialog-button-primary"
						onClick={handleDismiss}
					>
						Got it
					</button>
				</div>
			</div>
		</div>
	);
}
