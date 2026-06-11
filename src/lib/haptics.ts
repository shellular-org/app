import native from "bridge/native";
import { loadSettings, SETTINGS_CHANGED_EVENT } from "./settings";

let hapticEnabled = true;
let hapticInitialized = false;

/**
 * Sets up event delegation for haptic feedback.
 * Any element with class "haptic-trigger" will trigger haptic feedback on click.
 * This avoids repetitive onClick handlers throughout the codebase.
 */
export function initHapticDelegation(): void {
	if (hapticInitialized || typeof document === "undefined") {
		return;
	}

	hapticInitialized = true;

	loadSettings()
		.then((s) => {
			hapticEnabled = s.hapticFeedback;
		})
		.catch(console.error);

	window.addEventListener(SETTINGS_CHANGED_EVENT, (event) => {
		const detail = (event as CustomEvent).detail as {
			hapticFeedback?: boolean;
		};
		if (typeof detail.hapticFeedback === "boolean") {
			hapticEnabled = detail.hapticFeedback;
		}
	});

	document.addEventListener(
		"click",
		(event) => {
			const target = event.target as HTMLElement;
			if (target.closest(".haptic-trigger")) {
				triggerHaptic();
			}
		},
		{ passive: true },
	);
}

/**
 * Triggers a haptic feedback pulse on the device.
 * On iOS: Uses Core Haptics with UIImpactFeedbackGenerator fallback
 * On Android: Uses VibrationEffect
 * On browser: Uses navigator.vibrate
 */
export function triggerHaptic(): void {
	if (!hapticEnabled) return;

	native
		.haptic()
		.then(() => console.log("[Haptics] Haptic triggered"))
		.catch((err) => {
			console.warn("[Haptics] Failed to trigger haptic:", err);
		});
}
