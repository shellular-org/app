import { markRatingPrompted, openAppStore } from "lib/ratingService";
import { useCallback } from "react";
import "./style.scss";

interface RatingDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function RatingDialog({ isOpen, onClose }: RatingDialogProps) {
	const handleRate = useCallback(async () => {
		await markRatingPrompted();
		openAppStore();
		onClose();
	}, [onClose]);

	const handleNotNow = useCallback(async () => {
		await markRatingPrompted();
		onClose();
	}, [onClose]);

	if (!isOpen) {
		return null;
	}

	return (
		<div className="rating-dialog-overlay">
			<div className="rating-dialog">
				<div className="rating-dialog-header">
					<h2 className="rating-dialog-title">Love Shellular?</h2>
					<button
						type="button"
						className="rating-dialog-close"
						onClick={onClose}
						aria-label="Close"
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</div>
				<p className="rating-dialog-message">
					If you're enjoying Shellular, we'd love your feedback on the App
					Store. Your rating helps us improve and reach more developers.
				</p>
				<div className="rating-dialog-actions">
					<button
						type="button"
						className="rating-dialog-button rating-dialog-button-secondary"
						onClick={handleNotNow}
					>
						Not Now
					</button>
					<button
						type="button"
						className="rating-dialog-button rating-dialog-button-primary"
						onClick={handleRate}
					>
						Rate Now
					</button>
				</div>
			</div>
		</div>
	);
}
