import BottomSheet from "components/BottomSheet";
import { formatConnectionString } from "lib/e2ee";
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useState } from "react";
import type { SavedHost } from "state";

/**
 * How long the QR stays visible before it re-hides itself. This is a bearer
 * credential with no expiry — re-hiding keeps it from sitting exposed on a
 * screen the user walked away from, while a tap brings it straight back.
 */
const AUTO_HIDE_MS = 30_000;

interface HostQrSheetProps {
	host: SavedHost;
	open: boolean;
	onClose: () => void;
}

export default function HostQrSheet({ host, open, onClose }: HostQrSheetProps) {
	const [hidden, setHidden] = useState(false);
	const [secondsLeft, setSecondsLeft] = useState(AUTO_HIDE_MS / 1000);

	const label = host.alias || `${host.username}@${host.hostname}`;

	// The exact string the scanner expects: `{hostId}:{base64Key}`. Rendered as a
	// single SVG path (one rect per dark module would be ~1500 elements).
	const qr = useMemo(() => {
		if (!open) return null;
		const code = qrcode(0, "M");
		code.addData(formatConnectionString(host.hostId, host.encryptionKey));
		code.make();

		const count = code.getModuleCount();
		let path = "";
		for (let row = 0; row < count; row++) {
			for (let col = 0; col < count; col++) {
				if (code.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
			}
		}
		return { count, path };
	}, [open, host.hostId, host.encryptionKey]);

	// Reset visibility each time the sheet opens.
	useEffect(() => {
		if (!open) return;
		setHidden(false);
		setSecondsLeft(AUTO_HIDE_MS / 1000);
	}, [open]);

	// Count down while revealed, then hide.
	useEffect(() => {
		if (!open || hidden) return;

		const tick = setInterval(() => {
			setSecondsLeft((prev) => Math.max(prev - 1, 0));
		}, 1000);

		return () => clearInterval(tick);
	}, [open, hidden]);

	useEffect(() => {
		if (secondsLeft === 0) setHidden(true);
	}, [secondsLeft]);

	const reveal = () => {
		setHidden(false);
		setSecondsLeft(AUTO_HIDE_MS / 1000);
	};

	return (
		<BottomSheet open={open} onClose={onClose} title="Connection QR">
			<div className="flex flex-col items-center gap-4 pb-2">
				<p className="m-0 text-center text-[13px] leading-[1.45] text-secondary-text">
					Scan this from another device to connect it to{" "}
					<span className="font-semibold text-primary-text">{label}</span>.
				</p>

				<div className="relative">
					<div className="rounded-2xl border border-card-border bg-white p-3">
						{qr && (
							<svg
								viewBox={`0 0 ${qr.count} ${qr.count}`}
								className="block h-[232px] w-[232px]"
								role="img"
								aria-label={`Connection QR code for ${label}`}
								shapeRendering="crispEdges"
							>
								<title>{`Connection QR code for ${label}`}</title>
								<path d={qr.path} fill="#000000" />
							</svg>
						)}
					</div>

					{hidden && (
						<button
							type="button"
							onClick={reveal}
							className="haptic-trigger absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-card-border bg-[color-mix(in_srgb,var(--popup-background)_86%,transparent)] backdrop-blur-[14px]"
						>
							<span
								className="icon-eye text-[22px] text-secondary-text"
								aria-hidden="true"
							/>
							<span className="text-[13px] font-semibold text-primary-text">
								Tap to show QR
							</span>
						</button>
					)}
				</div>

				<p className="m-0 text-center text-[12px] leading-[1.45] text-secondary-text opacity-70">
					{hidden
						? "Hidden to keep it off your screen."
						: `Keep this QR code private — do not share it with anyone. Hiding in ${secondsLeft}s.`}
				</p>

				<button
					type="button"
					className="haptic-trigger mt-1 w-full rounded-xl border border-card-border bg-transparent px-4 py-3 text-[15px] font-semibold text-primary-text transition-[background] duration-150 active:bg-[color-mix(in_srgb,var(--primary-text)_8%,transparent)]"
					onClick={onClose}
				>
					Done
				</button>
			</div>
		</BottomSheet>
	);
}
