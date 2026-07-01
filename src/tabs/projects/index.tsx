import "./style.scss";
import { pushPage } from "App";
import dialog from "bridge/dialog";
import EmptyState from "components/EmptyState";
import TabPageHeader from "components/TabPageHeader";
import FilePage from "pages/files";
import { useRef, useState } from "react";
import { useShellular } from "state";
import ProjectList from "./ProjectList";

export default function ProjectsTab() {
	const { connectionStatus, projects, addProject, loadingProjects } =
		useShellular();
	const emptyButtonRef = useRef<HTMLButtonElement>(null);
	const headerAddButtonRef = useRef<HTMLButtonElement>(null);
	const [adding, setAdding] = useState(false);

	const handleProjectSelected = async (path: string) => {
		if (path === "/") {
			dialog.message(
				"Choose a folder inside the filesystem root. The root directory itself cannot be added as a project.",
				"Invalid Project",
			);
			return;
		}

		setAdding(true);
		try {
			await addProject(path);
		} catch (error) {
			dialog.message(
				`Failed to add project: ${(error as Error).message}`,
				"Error Adding Project",
			);
		}
		setAdding(false);
	};

	const handleOpenPicker = () => {
		pushPage(
			"project-picker",
			<FilePage mode="picker" onSelectFolder={handleProjectSelected} />,
		);
	};

	if (connectionStatus !== "connected") {
		return (
			<div className="projects-page projects-page--empty">
				<TabPageHeader title="Projects" />
				<EmptyState
					message="Connect to a device to browse projects"
					mascot="sleep"
				/>
			</div>
		);
	}

	return (
		<div className="projects-page">
			<TabPageHeader
				title="Projects"
				rightSlot={
					Boolean(projects.length) && (
						<button
							ref={headerAddButtonRef}
							type="button"
							className="projects-add-btn"
							onClick={handleOpenPicker}
							aria-label="Add project"
						>
							<span className="icon-plus" aria-hidden="true" />
						</button>
					)
				}
			/>

			{loadingProjects && <EmptyState message="Loading..." mascot="loading" />}
			{!loadingProjects && !projects.length && !adding && (
				<EmptyState
					message="No projects yet"
					description="Browse your device's file system to open a folder or git repo as a project."
					mascot="greeting"
					action={
						<>
							<button
								ref={emptyButtonRef}
								type="button"
								className="projects-empty-btn"
								onClick={handleOpenPicker}
							>
								<span className="icon-folder-plus" aria-hidden="true" />
								Browse files
							</button>
							{/* hidden target for the hero animation */}
							<button
								ref={headerAddButtonRef}
								type="button"
								className="projects-add-btn projects-add-btn--hidden"
								aria-hidden="true"
								tabIndex={-1}
							>
								<span className="icon-plus" aria-hidden="true" />
							</button>
						</>
					}
				/>
			)}
			<ProjectList projects={projects} adding={adding} />
		</div>
	);
}
