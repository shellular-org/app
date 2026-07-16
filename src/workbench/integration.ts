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

export const workspaceIntegration: WorkspaceIntegration = {
	async capabilities() {
		if (!process.env.IS_DESKTOP_UI) return unsupported;
		try {
			const capabilities = await native.getDesktopCapabilities();
			return {
				localWorkspace: capabilities.localWorkspace,
				editors: [],
				canReveal: capabilities.canRevealLocalPath,
				canOpenSystemTerminal: capabilities.canOpenSystemTerminal,
			};
		} catch {
			return unsupported;
		}
	},
	async openInEditor() {
		throw new Error("Local workspace integration is unavailable");
	},
	async reveal(path: string) {
		await native.revealLocalPath(path);
	},
	async openSystemTerminal(path: string) {
		await native.openSystemTerminal(path);
	},
};

import native from "bridge/native";
