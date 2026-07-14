export interface WorkspaceEditor {
	id: string;
	label: string;
}

export interface WorkspaceCapabilities {
	localWorkspace: boolean;
	editors: WorkspaceEditor[];
	canReveal: boolean;
	canOpenSystemTerminal: boolean;
}

export interface WorkspaceIntegration {
	capabilities(): Promise<WorkspaceCapabilities>;
	openInEditor(path: string, editorId: string): Promise<void>;
	reveal(path: string): Promise<void>;
	openSystemTerminal(path: string): Promise<void>;
}

const unsupported: WorkspaceCapabilities = {
	localWorkspace: false,
	editors: [],
	canReveal: false,
	canOpenSystemTerminal: false,
};

/** Replaced by a local-runtime provider when local mode is implemented. */
export const workspaceIntegration: WorkspaceIntegration = {
	async capabilities() {
		return unsupported;
	},
	async openInEditor() {
		throw new Error("Local workspace integration is unavailable");
	},
	async reveal() {
		throw new Error("Local workspace integration is unavailable");
	},
	async openSystemTerminal() {
		throw new Error("Local workspace integration is unavailable");
	},
};
