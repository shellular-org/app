import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

export interface WorkbenchChromeButton {
	id: string;
	label: string;
	icon: string;
	disabled?: boolean;
	onClick: () => void;
}

export interface WorkbenchPageChromeTargets {
	actions: HTMLElement | null;
	navigation: HTMLElement | null;
}

export interface PageSecondaryPanelController {
	isOpen: boolean;
	panelId: string;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

interface WorkbenchPageChromeContextValue {
	embedded: boolean;
	visible: boolean;
	focused: boolean;
	targets: WorkbenchPageChromeTargets;
}

const EMPTY_TARGETS: WorkbenchPageChromeTargets = {
	actions: null,
	navigation: null,
};

const WorkbenchPageChromeContext =
	createContext<WorkbenchPageChromeContextValue | null>(null);

export function WorkbenchPageChromeProvider({
	embedded = true,
	visible,
	focused,
	targets,
	children,
}: {
	embedded?: boolean;
	visible: boolean;
	focused: boolean;
	targets: WorkbenchPageChromeTargets;
	children: ReactNode;
}) {
	const value = useMemo(
		() => ({
			embedded,
			visible,
			focused,
			targets: visible ? targets : EMPTY_TARGETS,
		}),
		[embedded, focused, targets, visible],
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
	return Boolean(useContext(WorkbenchPageChromeContext)?.embedded);
}

export function usePageSecondaryPanel(
	key: string,
): PageSecondaryPanelController {
	const reactId = useId();
	const panelId = `page-secondary-panel-${safeId(key)}-${safeId(reactId)}`;
	const [isOpen, setIsOpen] = useState(false);
	const focusTargetRef = useRef<HTMLElement | null>(null);

	const open = useCallback(() => {
		const active = document.activeElement;
		focusTargetRef.current = active instanceof HTMLElement ? active : null;
		setIsOpen(true);
	}, []);
	const close = useCallback(() => {
		setIsOpen(false);
		requestAnimationFrame(() => focusTargetRef.current?.focus());
	}, []);
	const toggle = useCallback(() => {
		setIsOpen((current) => {
			if (current) {
				requestAnimationFrame(() => focusTargetRef.current?.focus());
				return false;
			}
			const active = document.activeElement;
			focusTargetRef.current = active instanceof HTMLElement ? active : null;
			return true;
		});
	}, []);

	return useMemo(
		() => ({ isOpen, panelId, open, close, toggle }),
		[close, isOpen, open, panelId, toggle],
	);
}

function safeId(value: string) {
	return value.replace(/[^a-zA-Z0-9_-]/g, "");
}
