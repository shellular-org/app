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
		<div
			className="mx-auto flex w-full max-w-[360px] items-center gap-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_28%,var(--card-border))] bg-[color-mix(in_srgb,var(--danger)_9%,var(--popup-background))] px-4 py-3.5 text-primary-text shadow-[var(--shadow)]"
			role="status"
			aria-live="polite"
		>
			<span
				className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-danger"
				aria-hidden="true"
			>
				<span className="icon-wifi-off text-[17px] before:!text-current" />
			</span>
			<div className="min-w-0">
				<strong className="block text-[13.5px] font-bold leading-[1.3] tracking-[-0.1px]">
					No internet connection
				</strong>
				<p className="mt-0.5 text-[12px] leading-[1.45] text-secondary-text">
					Connect this device to the internet to use Shellular.
				</p>
			</div>
		</div>
	);
};

export default OfflineBanner;
