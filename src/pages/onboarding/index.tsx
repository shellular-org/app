import Mascot from "components/Mascot";
import OfflineBanner from "components/OfflineBanner";
import "./style.scss";
import clsx from "clsx";
import Scanner from "components/Scanner";
import { useCallback, useEffect, useState } from "react";
import { useShellular } from "state";

const TOTAL_SLIDES = 4;

interface OnboardingProps {
	onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: OnboardingProps) {
	const { connectionStatus } = useShellular();
	const [currentSlide, setCurrentSlide] = useState(0);
	const [cliConfirmed, setCliConfirmed] = useState(false);
	const [online, setOnline] = useState(true);

	const goTo = useCallback((idx: number) => {
		setCurrentSlide(idx);
	}, []);

	const nextSlide = useCallback(() => {
		if (currentSlide < TOTAL_SLIDES - 1) {
			goTo(currentSlide + 1);
		} else {
			onComplete();
		}
	}, [currentSlide, goTo, onComplete]);

	const toggleConfirm = useCallback(() => {
		setCliConfirmed((prev) => !prev);
	}, []);

	const buttonDisabled = currentSlide === 1 && !cliConfirmed;

	let buttonLabel: string = "";
	let buttonIcon: string = "";

	switch (currentSlide) {
		case 0:
			buttonLabel = "Get started";
			buttonIcon = "icon-arrow-right";
			break;
		case 1:
			buttonLabel = "Scan the QR";
			buttonIcon = "icon-arrow-right";
			break;
		case 3:
			buttonLabel = "Start using Shellular";
			buttonIcon = "icon-arrow-right";
			break;

		default:
			break;
	}

	useEffect(() => {
		if (connectionStatus === "connected") {
			setCurrentSlide(3);
		}
	}, [connectionStatus]);

	return (
		<div className="onboarding">
			<div className="onboarding-top-bar">
				<div className="onboarding-progress-dots">
					<div
						className={clsx("onboarding-dot", {
							"onboarding-dot--active": currentSlide === 0,
						})}
					/>
					<div
						className={clsx("onboarding-dot", {
							"onboarding-dot--active": currentSlide === 1,
						})}
					/>
					<div
						className={clsx("onboarding-dot", {
							"onboarding-dot--active": currentSlide === 2,
						})}
					/>
					<div
						className={clsx("onboarding-dot", {
							"onboarding-dot--active": currentSlide === 3,
						})}
					/>
				</div>
				{process.env.DEV_MODE && (
					<button
						type="button"
						className={clsx("onboarding-skip-btn", {
							"onboarding-skip-btn--hidden": currentSlide === TOTAL_SLIDES - 1,
						})}
						onClick={onComplete}
					>
						Skip
					</button>
				)}
			</div>
			<OfflineBanner onChange={setOnline} />
			<div className="onboarding-slides-track">
				<Slide0 active={currentSlide === 0} />
				<Slide1
					active={currentSlide === 1}
					cliConfirmed={cliConfirmed}
					toggleConfirm={toggleConfirm}
				/>
				<Slide2
					active={currentSlide === 2}
					connectionStatus={connectionStatus}
				/>
				<Slide3 active={currentSlide === 3} />
			</div>

			{buttonLabel && (
				<div className="onboarding-bottom-controls">
					<button
						type="button"
						className="onboarding-btn-primary haptic-trigger"
						onClick={nextSlide}
						disabled={buttonDisabled || !online}
					>
						<span>{buttonLabel}</span>
						<span className={buttonIcon} />
					</button>
				</div>
			)}
		</div>
	);
}

function Slide0({ active }: { active: boolean }) {
	return (
		<div
			className={clsx("onboarding-slide", {
				"onboarding-slide--active": active,
			})}
		>
			<div className="onboarding-slide-center">
				<span className="icon-shellular onboarding-welcome-icon" />
				<div className="onboarding-welcome-title">
					Your dev environment
					<br />
					in your pocket
				</div>
				<div className="onboarding-welcome-sub" style={{ marginBottom: 32 }}>
					Agents, terminals, local files, git repos, and ports — from your
					phone.
				</div>
				<div className="onboarding-info-pills" style={{ width: "100%" }}>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon onboarding-info-pill-icon--green">
							<span className="icon-lock" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">
								End-to-end encrypted
							</div>
							<div className="onboarding-info-pill-desc">
								Key exchanged via QR, never over the network.
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function Slide1({
	active,
	cliConfirmed,
	toggleConfirm,
}: {
	active: boolean;
	cliConfirmed: boolean;
	toggleConfirm: () => void;
}) {
	return (
		<div
			className={clsx("onboarding-slide", {
				"onboarding-slide--active": active,
			})}
		>
			<div className="onboarding-slide-scroll">
				<div className="onboarding-device-badge">
					<span className="icon-monitor" />
					<span>On your computer</span>
				</div>
				<div className="onboarding-step-title">Run this one command</div>
				<div className="onboarding-step-desc">
					Go to the computer, laptop, or server you want to control, open its
					terminal, and run:
				</div>

				<div className="onboarding-terminal-card">
					<div className="onboarding-terminal-card-bar">
						<div
							className="onboarding-terminal-dot"
							style={{ background: "#FF5F57" }}
						/>
						<div
							className="onboarding-terminal-dot"
							style={{ background: "#FFBD2E" }}
						/>
						<div
							className="onboarding-terminal-dot"
							style={{ background: "#28CA41" }}
						/>
						<div className="onboarding-terminal-card-title">Your Terminal</div>
					</div>
					<div className="onboarding-terminal-body">
						<div>
							<span className="onboarding-t-dim">~ </span>
							<span className="onboarding-t-cmd">npx shellular</span>
						</div>
						<div className="onboarding-t-dim" style={{ margin: "4px 0 0" }}>
							Need to install the following packages:
						</div>
						<div className="onboarding-t-dim">shellular@latest</div>
						<div className="onboarding-t-dim">
							Ok to proceed? (y) <span className="onboarding-t-cmd">y</span>
						</div>
					</div>
				</div>

				<div className="onboarding-note-box">
					<span className="icon-info" />
					<span>
						Requires Node.js <em>v20.20.2 or newer</em> (LTS preferred).
						<br />
						Run <code>node -v</code> to check. Get it at{" "}
						<a
							href="https://nodejs.org"
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							nodejs.org
						</a>{" "}
						if needed.
					</span>
				</div>
			</div>{" "}
			<button
				type="button"
				className={clsx("onboarding-confirm-row haptic-trigger", {
					"onboarding-confirm-row--checked": cliConfirmed,
				})}
				onClick={toggleConfirm}
			>
				<div
					className={clsx("onboarding-checkbox", {
						"onboarding-checkbox--checked": cliConfirmed,
					})}
				>
					{cliConfirmed && <span className="icon-check" />}
				</div>
				<span className="onboarding-confirm-label">
					I see the QR code on my computer
				</span>
			</button>
		</div>
	);
}

function Slide2({
	active,
	connectionStatus,
}: {
	active: boolean;
	connectionStatus: string;
}) {
	// Once the phone has scanned a QR and is handshaking, the server is waiting
	// for the user to approve this device on their computer. Swap the scanner
	// for a dedicated "approve on your computer" view at that moment.
	const awaitingApproval =
		connectionStatus === "connecting" || connectionStatus === "reconnecting";

	return (
		<div
			className={clsx("onboarding-slide", {
				"onboarding-slide--active": active,
			})}
		>
			{awaitingApproval ? (
				<div className="onboarding-slide-center">
					<div className="onboarding-approve-visual">
						<div className="onboarding-approve-screen">
							<span className="icon-monitor" />
						</div>
						<div className="onboarding-approve-key">
							<kbd>Y</kbd>
						</div>
					</div>
					<div
						className="onboarding-step-title"
						style={{ textAlign: "center" }}
					>
						Now approve it on
						<br />
						your computer
					</div>
					<div
						className="onboarding-step-desc"
						style={{ textAlign: "center", marginBottom: 24 }}
					>
						Your terminal is asking to allow this phone. Press{" "}
						<kbd className="onboarding-inline-kbd">Y</kbd> there to connect.
					</div>
					<div className="onboarding-approve-status">
						<span className="onboarding-approve-spinner" />
						<span>Waiting for approval…</span>
					</div>
					<div className="onboarding-warn-box" style={{ marginTop: 20 }}>
						<span className="icon-alert-triangle" />
						<span>
							No prompt on your computer? Run <code>npx shellular clients</code>{" "}
							there to approve this device.
						</span>
					</div>
				</div>
			) : (
				<div className="onboarding-slide-scroll">
					<div className="onboarding-step-title">Scan the QR code</div>
					<div className="onboarding-step-desc">
						Your computer now shows a QR code. Point this phone at it.
					</div>

					<Scanner
						compact={true}
						showScanner={active}
						isOnboarding={true}
						setShowScanner={() => {}}
					/>
				</div>
			)}
		</div>
	);
}

function Slide3({ active }: { active: boolean }) {
	return (
		<div
			className={clsx("onboarding-slide", {
				"onboarding-slide--active": active,
			})}
		>
			<div className="onboarding-slide-center">
				<Mascot state="success" size={112} label="Setup complete" />
				<div
					className="onboarding-welcome-title"
					style={{ fontSize: 28, marginBottom: 12 }}
				>
					You're in.
				</div>
				<div className="onboarding-welcome-sub" style={{ marginBottom: 32 }}>
					Your dev environment is now in your pocket.
				</div>
				<div className="onboarding-info-pills" style={{ width: "100%" }}>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-ai-chat" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">Coding Agents</div>
							<div className="onboarding-info-pill-desc">
								Claude Code, Codex, OpenCode, Pi and more
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-terminal" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">Terminals</div>
							<div className="onboarding-info-pill-desc">
								Persistent terminals without tmux or ssh
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-folder" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">Files & Git</div>
							<div className="onboarding-info-pill-desc">
								Browse file, edit code, manage git repos
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-globe" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">
								Browser & DevTools
							</div>
							<div className="onboarding-info-pill-desc">
								Access your web apps and debug them
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
