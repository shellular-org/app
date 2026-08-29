export type ContextMenuId =
	| "text-edit"
	| "text-selection"
	| "editor"
	| "editor-diff"
	| "terminal"
	| "workbench-tab"
	| "project-pane"
	| "project-tree-file"
	| "project-tree-directory"
	| "git-repository"
	| "git-change"
	| "git-group"
	| "action-menu";

export type CommandId = string;

export type ContextMenuTrigger = "context" | "button" | "keyboard";

export interface CommandShortcut {
	key: string;
	modifiers?: Array<"meta" | "ctrl" | "alt" | "shift">;
}

export interface PlatformShortcuts {
	mac?: CommandShortcut;
	windows?: CommandShortcut;
	linux?: CommandShortcut;
}

export interface CommandDefinition {
	id: CommandId;
	label: string;
	icon?: string;
	macSymbol?: string;
	shortcuts?: PlatformShortcuts;
	danger?: boolean;
	radio?: boolean;
}

export interface CommandHandler {
	run: () => unknown | Promise<unknown>;
	enabled?: boolean | (() => boolean);
	visible?: boolean | (() => boolean);
	checked?: boolean | (() => boolean);
	label?: string | (() => string);
}

export interface CommandTarget {
	handlers: Record<CommandId, CommandHandler | undefined>;
}

export type ContextMenuAnchor =
	| { kind: "point"; x: number; y: number }
	| {
			kind: "rect";
			left: number;
			top: number;
			right: number;
			bottom: number;
	  };

export type ResolvedMenuItem =
	| { type: "separator" }
	| {
			type: "command";
			command: CommandId;
			label: string;
			icon?: string;
			macSymbol?: string;
			shortcut?: CommandShortcut;
			shortcutLabel?: string;
			danger?: boolean;
			disabled?: boolean;
			checked?: boolean;
			radio?: boolean;
	  }
	| {
			type: "submenu";
			label: string;
			items: ResolvedMenuItem[];
			icon?: string;
			macSymbol?: string;
	  };

export interface ContextMenuInvocation {
	menuId: ContextMenuId;
	commandGroups?: readonly (readonly CommandId[])[];
	target: CommandTarget;
	anchor: ContextMenuAnchor;
	trigger: ContextMenuTrigger;
	origin?: HTMLElement | null;
}

export interface ContextMenuPresenter {
	show(invocation: ContextMenuInvocation): Promise<CommandId | null>;
	dismiss(): void;
}
