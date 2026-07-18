import "./Scanner.scss";
import browser from "bridge/browser";
import scanner from "bridge/scanner";
import ConnectingIcon from "components/ConnectingIcon";
import Mascot from "components/Mascot";
import actionStack from "lib/actionStack";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShellular } from "state";

interface ScannerProps {
	compact: boolean;
	showScanner: boolean;
	isOnboarding?: boolean;
	setShowScanner: (val: boolean) => void;
}

export default function Scanner({
	compact = false,
	isOnboarding = false,
	showScanner,
	setShowScanner,
}: ScannerProps) {
	const { connect, connectionStatus } = useShellular();
	const viewfinderRef = useRef<HTMLDivElement>(null);
	const uploadInputRef = useRef<HTMLInputElement>(null);
	const [uploadingQr, setUploadingQr] = useState(false);
	const [error, setError] = useState("");

	const connecting = connectionStatus === "connecting";

	const connectToHost = useCallback(
		async (hostAndKey: string) => {
			if (!hostAndKey) {
				setError(
					"This QR code did not contain a valid connection token. Please try again.",
				);
				return false;
			}

			try {
				await connect(hostAndKey);
				return true;
			} catch (err) {
				if (err instanceof Error) {
					setError(err.message);
				} else {
					setError("Unable to connect with this QR.");
				}

				return false;
			}
		},
		[connect],
	);

	const handleCancelScanner = useCallback(() => {
		actionStack.remove("qr-code-scanner");
		scanner.hide().catch(console.error);
		setShowScanner(false);
	}, [setShowScanner]);

	const startScan = useCallback(async () => {
		const viewFinder = viewfinderRef.current;
		if (!viewFinder) {
			return;
		}

		actionStack.push({
			id: "qr-code-scanner",
			action: () => {
				handleCancelScanner();
			},
		});

		try {
			await scanner.show(viewFinder);

			const results = await scanner.scanOnce();

			setError("");
			if (!results?.length) {
				startScan();
				return;
			}

			const result = results.find((s) => Boolean(s.rawValue));
			if (!result?.rawValue) {
				throw new Error(
					"Either there was no QR code, or the value was invalid. Please try again with a valid QR code.",
				);
			}

			const success = await connectToHost(result.rawValue);

			if (success) {
				setShowScanner(false);
			} else {
				startScan();
			}
		} catch (err) {
			console.error(err);
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError("Unable to connect to server");
			}
		}

		actionStack.remove("qr-code-scanner");
	}, [connectToHost, setShowScanner, handleCancelScanner]);

	const handleUploadQr = useCallback(
		async (file: File | undefined) => {
			if (!file || uploadingQr) {
				return;
			}

			try {
				setUploadingQr(true);
				scanner.hide().catch(console.error);

				const results = await scanner.scanImage(file);
				const result = results?.find((s) => Boolean(s.rawValue));
				if (!result?.rawValue) {
					throw new Error(
						"Either there was no QR code, or the value was invalid. Please try again with a valid QR code.",
					);
				}
				const connected = await connectToHost(result.rawValue);
				if (connected) {
					setShowScanner(false);
				}
			} catch (err) {
				console.error(err);
				setError(
					err instanceof Error
						? err.message
						: "Failed to read a QR code from this image.",
				);
			} finally {
				setUploadingQr(false);
				if (uploadInputRef.current) {
					uploadInputRef.current.value = "";
				}
			}
		},
		[connectToHost, setShowScanner, uploadingQr],
	);

	useEffect(() => {
		if (!showScanner) return;
		const timer = setTimeout(() => startScan(), 100);
		return () => {
			clearTimeout(timer);
			scanner.hide().catch(console.error);
		};
	}, [showScanner, startScan]);

	return (
		<div className={`qr-scanner${compact && !showScanner ? " compact" : ""}`}>
			{!connecting && (
				<>
					{!showScanner && (
						<div className="scanner-state-view">
							<button
								type="button"
								className="scan-btn haptic-trigger"
								onClick={() => setShowScanner(true)}
								aria-label="Scan QR code"
							>
								{error ? (
									<Mascot
										state={
											uploadingQr
												? "loading"
												: error
													? "error"
													: compact
														? "idle"
														: "greeting"
										}
										size={82}
									/>
								) : (
									<span
										className="icon-qr_code_scanner"
										style={{ fontSize: "4rem" }}
										aria-hidden="true"
									/>
								)}
							</button>
							<span className="scan-label">Tap to scan a QR code</span>
							{error && (
								<div className="text-sm text-(--error) text-center">
									<span className="icon-info" /> {error}
								</div>
							)}
							<div className="scan-fallback">
								<button
									type="button"
									className="upload-qr-btn haptic-trigger"
									onClick={() => uploadInputRef.current?.click()}
									disabled={uploadingQr}
								>
									{uploadingQr ? "" : " or "}
									<span className="icon-upload" aria-hidden="true" />
									{uploadingQr ? "Reading image..." : "Upload QR image"}
								</button>
							</div>
						</div>
					)}

					{showScanner && (
						<div className="inline-scanner">
							<div className="viewfinder" ref={viewfinderRef} />
							<div className="scanner-state">
								<Mascot
									state={uploadingQr ? "loading" : error ? "error" : "thinking"}
									size={42}
									tone="inline"
								/>
								<span>
									{uploadingQr
										? "Reading QR image..."
										: error
											? "QR scan needs attention"
											: "Looking for a QR code..."}
								</span>
							</div>
							{error && (
								<div className="text-sm text-(--error) text-center">
									<span className="icon-info" /> {error}
								</div>
							)}
							{!isOnboarding && (
								<span className="scan-label">
									Run <code>npx shellular</code> on your machine to get a QR
									code.
								</span>
							)}
							<div className="scanner-actions">
								<button
									type="button"
									className="upload-qr-btn haptic-trigger"
									onClick={() => uploadInputRef.current?.click()}
									disabled={uploadingQr}
								>
									<span className="icon-upload" aria-hidden="true" />
									{uploadingQr ? "Reading image..." : "Upload image"}
								</button>
								{!isOnboarding && (
									<button
										type="button"
										className="scanner-cancel-btn haptic-trigger"
										onClick={handleCancelScanner}
									>
										Cancel
									</button>
								)}
							</div>
						</div>
					)}
				</>
			)}

			{connecting && (
				<div className="scanner-state-view">
					<div className="scan-btn">
						<ConnectingIcon size={100} />
					</div>
					<span className="scan-label connecting">Connecting...</span>
					<span className="scan-label" style={{ textAlign: "center" }}>
						If your device is not approved, check CLI to approve or visit&nbsp;
						<button
							type="button"
							style={{
								color: "var(--link)",
							}}
							onClick={() => {
								browser.open("https://shellular.dev/docs#client-approval");
							}}
						>
							docs
						</button>
						.
					</span>
				</div>
			)}
			<input
				ref={uploadInputRef}
				type="file"
				accept="image/*"
				className="qr-upload-input"
				onChange={(event) => handleUploadQr(event.currentTarget.files?.[0])}
			/>
		</div>
	);
}
