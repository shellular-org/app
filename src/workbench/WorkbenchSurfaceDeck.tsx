import { type ReactNode, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { findWorkbenchTab } from "./layoutTree";
import {
	WorkbenchPageChromeProvider,
	type WorkbenchPageChromeTargets,
} from "./pageChrome";
import type { WorkbenchSnapshot, WorkbenchSurface } from "./types";

export interface WorkbenchPaneTargets extends WorkbenchPageChromeTargets {
	body: HTMLElement | null;
}

const EMPTY_TARGETS: WorkbenchPaneTargets = {
	body: null,
	actions: null,
	navigation: null,
};

export default function WorkbenchSurfaceDeck({
	snapshot,
	compact,
	targetsByGroup,
	renderSurface,
}: {
	snapshot: WorkbenchSnapshot;
	compact: boolean;
	targetsByGroup: ReadonlyMap<string, WorkbenchPaneTargets>;
	renderSurface: (surface: WorkbenchSurface) => ReactNode;
}) {
	const parkingRef = useRef<HTMLDivElement>(null);
	const hostsRef = useRef(new Map<string, HTMLElement>());
	const liveIds = new Set(snapshot.surfaces.map((surface) => surface.id));

	for (const surface of snapshot.surfaces) {
		if (hostsRef.current.has(surface.id)) continue;
		const host = document.createElement("section");
		host.className = "workbench-surface size-full min-h-0 min-w-0";
		host.dataset.surfaceId = surface.id;
		host.id = `workbench-surface-${surface.id}`;
		host.setAttribute("role", "tabpanel");
		hostsRef.current.set(surface.id, host);
	}

	useLayoutEffect(() => {
		for (const [id, host] of hostsRef.current) {
			if (liveIds.has(id)) continue;
			host.remove();
			hostsRef.current.delete(id);
		}

		for (const surface of snapshot.surfaces) {
			const host = hostsRef.current.get(surface.id);
			const location = findWorkbenchTab(snapshot.root, surface.id);
			if (!host || !location) continue;
			const visible =
				location.group.activeId === surface.id &&
				(!compact || location.group.id === snapshot.focusedGroupId);
			const body = targetsByGroup.get(location.group.id)?.body;
			const destination = visible && body ? body : parkingRef.current;
			if (destination && host.parentElement !== destination) {
				destination.appendChild(host);
			}
			host.style.display = visible ? "" : "none";
			host.setAttribute("aria-hidden", String(!visible));
		}
	}, [compact, liveIds, snapshot, targetsByGroup]);

	return (
		<>
			<div ref={parkingRef} className="hidden" aria-hidden="true" />
			{snapshot.surfaces.map((surface) => {
				const host = hostsRef.current.get(surface.id);
				const location = findWorkbenchTab(snapshot.root, surface.id);
				if (!host || !location) return null;
				const visible =
					location.group.activeId === surface.id &&
					(!compact || location.group.id === snapshot.focusedGroupId);
				const targets = targetsByGroup.get(location.group.id) ?? EMPTY_TARGETS;
				return createPortal(
					<WorkbenchPageChromeProvider
						embedded
						visible={visible}
						focused={location.group.id === snapshot.focusedGroupId}
						targets={targets}
					>
						{renderSurface(surface)}
					</WorkbenchPageChromeProvider>,
					host,
					surface.id,
				);
			})}
		</>
	);
}
