import "./OfflineBanner.scss";
import { getOnlineStatus } from "lib/utils";
import { useEffect, useRef, useState } from "react";

interface OfflineBannerProps {
	onChange?: (isOnline: boolean) => void;
}

const OfflineBanner: React.FC<OfflineBannerProps> = ({ onChange }) => {
	const [isOnline, setIsOnline] = useState<boolean>(getOnlineStatus);

	const onChangeRef = useRef(onChange);

	// keep ref updated without re-running effect
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const handleOnline = () => {
			setIsOnline(true);
			if (onChangeRef.current) {
				onChangeRef.current(true);
			}
		};

		const handleOffline = () => {
			setIsOnline(false);
			if (onChangeRef.current) {
				onChangeRef.current(false);
			}
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	if (isOnline) {
		return null;
	}

	return (
		<div className="offline-banner" role="status" aria-live="polite">
			<span className="icon-wifi-off" />
			<div className="offline-banner-copy">
				<strong>No internet connection</strong>
				<p>Connect this device to the internet to use Shellular.</p>
			</div>
		</div>
	);
};

export default OfflineBanner;
