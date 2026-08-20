import { loadSettings, SETTINGS_CHANGED_EVENT } from "lib/settings";
import { useEffect, useState } from "react";
import { WINDOW_SIZE } from "../lib/workLogLayout";

/**
 * How many work rows stay on screen before the rest go behind the "N earlier
 * steps" control. The old latest-only view survives as a value of one rather
 * than as a second rendering path, so there is nothing extra to keep in sync.
 */
export function useWorkLogWindowSize(): number {
	const [size, setSize] = useState(WINDOW_SIZE);

	useEffect(() => {
		let mounted = true;
		const apply = (showEveryStep: boolean) => {
			if (mounted) setSize(showEveryStep ? WINDOW_SIZE : 1);
		};
		void loadSettings()
			.then((settings) => apply(settings.chat.showEveryStep))
			.catch(() => {});
		const onSettingsChanged = (event: Event) => {
			const settings = (event as CustomEvent).detail;
			if (settings?.chat) apply(Boolean(settings.chat.showEveryStep));
		};
		window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
		return () => {
			mounted = false;
			window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
		};
	}, []);

	return size;
}
