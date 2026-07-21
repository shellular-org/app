import { describe, expect, it } from "vitest";
import type { WorkbenchSurface } from "./types";
import {
	findContainingProject,
	formatWorkbenchDocumentTitle,
	resolveWorkbenchContextTitle,
} from "./windowTitle";

const projects = [
	{ name: "Workspace", path: "/work", gitInfo: { hasGit: false } },
	{ name: "Shellular", path: "/work/shellular", gitInfo: { hasGit: true } },
] as never[];

describe("workbench window title", () => {
	it("uses the most specific containing project", () => {
		expect(
			findContainingProject("/work/shellular/src/app.ts", projects)?.name,
		).toBe("Shellular");
		expect(
			resolveWorkbenchContextTitle(
				{
					kind: "editor",
					id: "editor",
					title: "app.ts",
					icon: "icon-file",
					filePath: "/work/shellular/src/app.ts",
				} as WorkbenchSurface,
				projects,
			),
		).toBe("Shellular");
	});

	it("uses explicit comparison and terminal workspace context", () => {
		const diff = {
			kind: "editor",
			id: "diff",
			title: "outside.ts",
			icon: "icon-file",
			filePath: "/tmp/outside.ts",
			gitComparison: {
				projectPath: "/work/shellular",
				relativePath: "outside.ts",
				target: "head-to-index",
			},
		} as WorkbenchSurface;
		expect(resolveWorkbenchContextTitle(diff, projects)).toBe("Shellular");
		expect(
			resolveWorkbenchContextTitle(
				{
					kind: "terminal",
					id: "terminal:1",
					title: "Terminal",
					icon: "icon-terminal",
					terminalId: "1",
					workspacePath: "/work/shellular",
				},
				projects,
			),
		).toBe("Shellular");
	});

	it("resolves every project-backed workbench surface", () => {
		const surfaces = [
			{
				kind: "chat",
				id: "chat:1",
				title: "Chat",
				icon: "icon-message-circle",
				agentId: "codex",
				sessionId: "1",
				workspacePath: "/work/shellular",
			},
			{
				kind: "agent-sessions",
				id: "sessions:1",
				title: "Sessions",
				icon: "icon-ai-chat",
				agentId: "codex",
				workspacePath: "/work/shellular",
			},
			{
				kind: "files",
				id: "files:1",
				title: "Files",
				icon: "icon-folder",
				initialPath: "/work/shellular/src",
				mode: "project",
			},
			{
				kind: "git",
				id: "git:1",
				title: "Source Control",
				icon: "icon-git-branch",
				projectPath: "/work/shellular",
				projectName: "Shellular",
			},
		] as WorkbenchSurface[];

		for (const surface of surfaces) {
			expect(resolveWorkbenchContextTitle(surface, projects)).toBe("Shellular");
		}
	});

	it("falls back to the dynamic active page title and bare app title", () => {
		const settings = {
			kind: "utility",
			id: "utility:settings",
			title: "Settings",
			icon: "icon-settings",
			page: "settings",
		} as WorkbenchSurface;
		expect(
			resolveWorkbenchContextTitle(settings, projects, "Preferences"),
		).toBe("Preferences");
		expect(
			resolveWorkbenchContextTitle(
				{
					kind: "terminal",
					id: "terminal:legacy",
					title: "Terminal",
					icon: "icon-terminal",
					terminalId: "legacy",
				},
				projects,
			),
		).toBe("Terminal");
		expect(resolveWorkbenchContextTitle(undefined, projects)).toBe("Home");
	});

	it("uses a single project for project-aware sidebar contexts", () => {
		const oneProject = [projects[1]];
		expect(
			resolveWorkbenchContextTitle(
				undefined,
				oneProject,
				undefined,
				"projects",
			),
		).toBe("Shellular");
		expect(
			resolveWorkbenchContextTitle(undefined, oneProject, undefined, "git"),
		).toBe("Shellular");
		expect(
			resolveWorkbenchContextTitle(undefined, projects, undefined, "projects"),
		).toBe("Projects");
	});

	it("formats browser tabs without prefixing the visible macOS context", () => {
		expect(formatWorkbenchDocumentTitle("Shellular", "browser")).toBe(
			"Shellular — Shellular",
		);
		expect(formatWorkbenchDocumentTitle("Shellular", "macos")).toBe(
			"Shellular",
		);
	});
});
