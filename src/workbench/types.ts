import type { AiBackend } from "@shellular/protocol";
import type { GitDiffTarget, GitFileStatus } from "state";

interface SurfaceBase {
	id: string;
	title: string;
	icon: string;
	showConnectionBanner?: boolean;
	/** Runtime presentation state. It is deliberately omitted from persistence. */
	dirty?: boolean;
	/** False for surfaces whose payload must not be written to persisted storage. */
	restorable?: boolean;
}

export type EditorComparison =
	| {
			kind: "working-tree";
			projectPath: string;
			relativePath: string;
			target: GitDiffTarget;
	  }
	| {
			kind: "commit";
			projectPath: string;
			relativePath: string;
			hash: string;
	  }
	| {
			kind: "inline";
			workspacePath: string;
			relativePath: string;
			sourceId: string;
			oldText: string;
			newText: string;
	  };

export interface ChatSurface extends SurfaceBase {
	kind: "chat";
	agentId: AiBackend;
	sessionId: string;
	workspacePath: string;
	createOnFirstMessage?: boolean;
}

export interface TerminalSurface extends SurfaceBase {
	kind: "terminal";
	terminalId: string;
	workspacePath?: string;
}

export type UtilityPage =
	| "settings"
	| "ports"
	| "about"
	| "reach-out"
	| "account"
	| "system-monitor"
	| "agents"
	| "manage-agents"
	| "bookmarked-sessions";

export interface UtilitySurface extends SurfaceBase {
	kind: "utility";
	page: UtilityPage;
}

export interface FilesSurface extends SurfaceBase {
	kind: "files";
	initialPath: string;
	mode: "project";
}

export interface GitSurface extends SurfaceBase {
	kind: "git";
	projectPath: string;
	projectName: string;
}

export interface EditorSurface extends SurfaceBase {
	kind: "editor";
	filePath: string;
	gitStatus?: GitFileStatus;
	initialLine?: number;
	initialColumn?: number;
	readOnly?: boolean;
	comparison?: EditorComparison;
	/** Backward-compatible shape for restored pre-Monaco Git diff tabs. */
	gitComparison?: {
		projectPath: string;
		relativePath: string;
		target: GitDiffTarget;
	};
}

export interface AgentSessionsSurface extends SurfaceBase {
	kind: "agent-sessions";
	agentId: AiBackend;
	workspacePath?: string;
}

export interface BrowserSurface extends SurfaceBase {
	kind: "browser";
	url: string;
}

export type WorkbenchSurface =
	| ChatSurface
	| TerminalSurface
	| UtilitySurface
	| FilesSurface
	| GitSurface
	| EditorSurface
	| AgentSessionsSurface
	| BrowserSurface;

export type CloseGuard = () => boolean | Promise<boolean>;

export interface WorkbenchSnapshot {
	tabs: WorkbenchSurface[];
	activeId: string | null;
	hostId: string;
	dialog: WorkbenchSurface | null;
}

export type WorkbenchPresentation = "tab" | "dialog";
