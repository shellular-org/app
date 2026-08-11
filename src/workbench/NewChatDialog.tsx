import type { AiBackend } from "@shellular/protocol";
import { getAgentIcon } from "lib/agents";
import { chatTabId } from "lib/chatTabId";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectInfo } from "state";
import type { AcpAgentInfo } from "state/acp";
import { openWorkbenchSurface } from "./store";

interface NewChatDialogProps {
	hostId: string;
	projects: ProjectInfo[];
	agents: AcpAgentInfo[];
	initialProjectPath?: string;
	onOpenFolder: () => void | Promise<void>;
	onClose: () => void;
}

function preferenceKey(hostId: string) {
	return `shellular:desktop-new-chat:v1:${hostId}`;
}

export default function NewChatDialog({
	hostId,
	projects,
	agents,
	initialProjectPath,
	onOpenFolder,
	onClose,
}: NewChatDialogProps) {
	const initialFocusRef = useRef<HTMLSelectElement>(null);
	const saved = useMemo(() => {
		try {
			const stored =
				localStorage.getItem(preferenceKey(hostId)) ??
				localStorage.getItem(`shellular:mac-new-chat:v1:${hostId}`) ??
				"{}";
			return JSON.parse(stored) as {
				projectPath?: string;
				agentId?: AiBackend;
			};
		} catch {
			return {};
		}
	}, [hostId]);
	const [projectPath, setProjectPath] = useState(() =>
		projects.some((project) => project.path === initialProjectPath)
			? (initialProjectPath ?? "")
			: projects.some((project) => project.path === saved.projectPath)
				? (saved.projectPath ?? "")
				: "",
	);
	const [agentId, setAgentId] = useState<AiBackend | "">(() =>
		agents.some((agent) => agent.id === saved.agentId)
			? (saved.agentId ?? "")
			: "",
	);

	useEffect(() => {
		initialFocusRef.current?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	useEffect(() => {
		if (
			projectPath &&
			!projects.some((project) => project.path === projectPath)
		) {
			setProjectPath("");
		}
	}, [projectPath, projects]);

	const startChat = () => {
		const project = projects.find((entry) => entry.path === projectPath);
		const agent = agents.find((entry) => entry.id === agentId);
		if (!project || !agent) return;
		localStorage.setItem(
			preferenceKey(hostId),
			JSON.stringify({ projectPath: project.path, agentId: agent.id }),
		);
		openWorkbenchSurface({
			kind: "chat",
			id: chatTabId(agent.id, ""),
			title: "New Chat",
			icon: getAgentIcon(agent.id),
			agentId: agent.id,
			sessionId: "",
			workspacePath: project.path,
			createOnFirstMessage: true,
		});
		onClose();
	};

	return (
		<div
			className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-6 backdrop-blur-[2px]"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby="new-chat-title"
				className="w-full max-w-[460px] overflow-hidden rounded-xl border border-card-border bg-popup-background text-primary-text shadow-2xl"
			>
				<header className="flex h-12 items-center justify-between border-b border-card-border px-4">
					<h2 id="new-chat-title" className="m-0 text-sm font-bold">
						New Chat
					</h2>
					<button
						type="button"
						className="grid size-8 place-items-center rounded-md text-secondary-text hover:bg-surface-soft hover:text-primary-text"
						onClick={onClose}
						aria-label="Close new chat dialog"
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</header>
				<div className="flex flex-col gap-5 p-5">
					<label className="flex flex-col gap-2 text-xs font-semibold text-secondary-text">
						Project
						<select
							ref={initialFocusRef}
							className="h-10 rounded-lg border border-card-border bg-primary px-3 text-sm text-primary-text outline-none focus:border-accent"
							value={projectPath}
							onChange={(event) => setProjectPath(event.target.value)}
						>
							<option value="">Select a project…</option>
							{projects.map((project) => (
								<option key={project.path} value={project.path}>
									{project.name} — {project.path}
								</option>
							))}
						</select>
					</label>
					{projects.length === 0 && (
						<button
							type="button"
							className="flex h-10 items-center justify-center gap-2 rounded-lg border border-card-border bg-surface-soft text-sm font-semibold hover:border-accent"
							onClick={() => void onOpenFolder()}
						>
							<span className="icon-folder-plus" aria-hidden="true" />
							Open Folder
						</button>
					)}
					<label className="flex flex-col gap-2 text-xs font-semibold text-secondary-text">
						Agent
						<select
							className="h-10 rounded-lg border border-card-border bg-primary px-3 text-sm text-primary-text outline-none focus:border-accent"
							value={agentId}
							disabled={agents.length === 0}
							onChange={(event) => setAgentId(event.target.value as AiBackend)}
						>
							<option value="">Select an agent…</option>
							{agents.map((agent) => (
								<option key={agent.id} value={agent.id}>
									{agent.title || agent.name}
								</option>
							))}
						</select>
					</label>
					{agents.length === 0 && (
						<p className="m-0 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-secondary-text">
							No compatible agents are available on this host.
						</p>
					)}
				</div>
				<footer className="flex justify-end gap-2 border-t border-card-border px-5 py-3">
					<button
						type="button"
						className="h-9 rounded-lg px-4 text-sm text-secondary-text hover:bg-surface-soft hover:text-primary-text"
						onClick={onClose}
					>
						Cancel
					</button>
					<button
						type="button"
						className="h-9 rounded-lg bg-accent px-4 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!projectPath || !agentId}
						onClick={startChat}
					>
						Start Chat
					</button>
				</footer>
			</section>
		</div>
	);
}
