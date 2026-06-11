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
			buttonLabel = "CLI is running, continue";
			buttonIcon = "icon-arrow-right";
			break;
		case 3:
			buttonLabel = "Start using Shellular";
			buttonIcon = "icon-zap";
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
				<Slide2 active={currentSlide === 2} />
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
					Your dev machine
					<br />
					in your pocket
				</div>
				<div className="onboarding-welcome-sub" style={{ marginBottom: 32 }}>
					Access your agents, terminals, files, and ports from your phone.
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
								Pairing key exchanged via QR, never over the network.
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-zap" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">No accounts</div>
							<div className="onboarding-info-pill-desc">
								One CLI command to connect to your machine.
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
				<div className="onboarding-step-title">Start the CLI</div>
				<div className="onboarding-step-desc">
					Run this on the machine you want to connect - Your laptop, desktop,
					Mac Mini or server.
				</div>

				<div className="onboarding-cmd-block">
					<span className="icon-chevron-right"></span>
					<span className="pl-1! onboarding-cmd-text">npx shellular</span>
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
						<div className="onboarding-terminal-card-title">Terminal</div>
					</div>
					<div className="onboarding-terminal-body">
						<div>
							<span className="onboarding-t-dim">~ </span>
							<span className="onboarding-t-cmd">npx shellular</span>
						</div>
						<div className="onboarding-t-dim" style={{ margin: "4px 0 0" }}>
							Need to install: shellular@latest
						</div>
						<div className="onboarding-t-dim">
							Ok to proceed? (y) <span className="onboarding-t-cmd">y</span>
						</div>
						<div style={{ marginTop: 8 }}>
							<span className="onboarding-t-green">✔</span>{" "}
							<span className="onboarding-t-hi">Shellular</span>{" "}
							<span className="onboarding-t-dim">v0.0.15 ready</span>
						</div>
						<div>
							<span className="onboarding-t-green">✔</span>{" "}
							<span className="onboarding-t-dim">WebSocket relay started</span>
						</div>
						<div style={{ marginTop: 8 }}>
							<span className="onboarding-t-dim">Install the app: </span>
							<span className="onboarding-t-cyan">shellular.dev</span>
						</div>
						<div style={{ marginTop: 6 }}>
							<span className="onboarding-t-dim">
								Waiting for a device to connect...
							</span>{" "}
							<span className="onboarding-cursor" />
						</div>
					</div>
				</div>

				<div className="onboarding-note-box">
					<span className="icon-info" />
					<span>
						Requires Node.js. Run <code>node -v</code> to check. Get it at{" "}
						<code>nodejs.org</code> if needed.
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
					CLI is running on my machine
				</span>
			</button>
		</div>
	);
}

function Slide2({ active }: { active: boolean }) {
	return (
		<div
			className={clsx("onboarding-slide", {
				"onboarding-slide--active": active,
			})}
		>
			<div className="onboarding-slide-scroll">
				<div className="onboarding-step-title">Scan the QR code</div>
				<div className="onboarding-step-desc">
					Your terminal shows a QR code. Point this phone at it to connect.
				</div>

				<Scanner
					compact={true}
					showScanner={active}
					isOnboarding={true}
					setShowScanner={() => {}}
				/>

				<div className="onboarding-info-pills">
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-shield" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">
								Out-of-band pairing
							</div>
							<div className="onboarding-info-pill-desc">
								Pairing key lives in the QR only, never sent over the network.
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span
								className="icon-check-circle"
								style={{ color: "var(--success)" }}
							/>
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">
								Press Y in the terminal
							</div>
							<div className="onboarding-info-pill-desc">
								After scanning, your terminal asks to approve this device. Press
								Y.
							</div>
						</div>
					</div>
				</div>

				<div className="onboarding-warn-box">
					<span className="icon-alert-triangle" />
					<span>
						Connection rejected or no prompt? Run{" "}
						<code>npx shellular clients</code> to find and approve this device.
					</span>
				</div>
			</div>
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
					Your dev machine is now in your pocket.
				</div>
				<div className="onboarding-info-pills" style={{ width: "100%" }}>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-terminal" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">Terminal</div>
							<div className="onboarding-info-pill-desc">
								Live shell access to your machine.
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-ai-chat" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">AI Agents</div>
							<div className="onboarding-info-pill-desc">
								Run Claude Code, Codex, OpenCode.
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-folder" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">Files</div>
							<div className="onboarding-info-pill-desc">
								Browse and edit your project files.
							</div>
						</div>
					</div>
					<div className="onboarding-info-pill">
						<div className="onboarding-info-pill-icon">
							<span className="icon-globe" />
						</div>
						<div className="onboarding-info-pill-text">
							<div className="onboarding-info-pill-title">Browser</div>
							<div className="onboarding-info-pill-desc">
								Access localhost web apps on the go.
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
