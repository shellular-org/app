import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface WorkbenchChromeButton {
	id: string;
	label: string;
	icon: string;
	disabled?: boolean;
	onClick: () => void;
}

export interface WorkbenchPageChromeTargets {
	title: HTMLElement | null;
	actions: HTMLElement | null;
	navigation: HTMLElement | null;
}

interface WorkbenchPageChromeContextValue {
	active: boolean;
	targets: WorkbenchPageChromeTargets;
}

const EMPTY_TARGETS: WorkbenchPageChromeTargets = {
	title: null,
	actions: null,
	navigation: null,
};

const WorkbenchPageChromeContext =
	createContext<WorkbenchPageChromeContextValue | null>(null);

export function WorkbenchPageChromeProvider({
	active,
	targets,
	children,
}: {
	active: boolean;
	targets: WorkbenchPageChromeTargets;
	children: ReactNode;
}) {
	const value = useMemo(
		() => ({
			active,
			targets: active ? targets : EMPTY_TARGETS,
		}),
		[active, targets],
	);
	return (
		<WorkbenchPageChromeContext.Provider value={value}>
			{children}
		</WorkbenchPageChromeContext.Provider>
	);
}

export function useWorkbenchPageChromeTargets() {
	return useContext(WorkbenchPageChromeContext);
}

export function useIsWorkbenchPageChromeActive() {
	return Boolean(useContext(WorkbenchPageChromeContext)?.active);
}
