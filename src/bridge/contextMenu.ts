import type { NativeContextMenuViewport } from "context-menu/native";
import type {
	ContextMenuAnchor,
	ContextMenuTrigger,
	ResolvedMenuItem,
} from "context-menu/types";
import bridge from "./bridge";

const contextMenu = bridge("ContextMenu");

export function showNativeContextMenu(request: {
	id: number;
	trigger: ContextMenuTrigger;
	anchor: ContextMenuAnchor;
	viewport: NativeContextMenuViewport;
	items: ResolvedMenuItem[];
}): Promise<string | null> {
	return contextMenu("show", [request]) as Promise<string | null>;
}

export function cancelNativeContextMenu(): Promise<void> {
	return contextMenu("cancel") as Promise<void>;
}
