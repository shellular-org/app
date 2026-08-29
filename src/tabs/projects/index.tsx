import "./style.scss";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import TabPageHeader from "components/TabPageHeader";
import { useEffect, useRef } from "react";
import { useShellular } from "state";
import ProjectList from "./ProjectList";
import useProjectPicker from "./useProjectPicker";

export default function ProjectsTab() {
	const { connectionStatus, projects, loadingProjects, loadProjects } =
		useShellular();
	const emptyButtonRef = useRef<HTMLButtonElement>(null);
	const headerAddButtonRef = useRef<HTMLButtonElement>(null);
	const { adding, openProjectPicker } = useProjectPicker();

	useEffect(() => {
		if (connectionStatus === "connected") {
			loadProjects();
		}
	}, [connectionStatus, loadProjects]);

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
					loadingProjects ? (
						<Loader size={16} />
					) : (
						<>
							<button
								type="button"
								className="projects-add-btn"
								onClick={() => loadProjects(true)}
								aria-label="Refresh projects"
							>
								<span className="icon-refresh-cw" aria-hidden="true" />
							</button>
							{Boolean(projects.length) && (
								<button
									ref={headerAddButtonRef}
									type="button"
									className="projects-add-btn"
									onClick={openProjectPicker}
									aria-label="Add project"
								>
									<span className="icon-plus" aria-hidden="true" />
								</button>
							)}
						</>
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
								onClick={openProjectPicker}
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
			{!loadingProjects && <ProjectList projects={projects} adding={adding} />}
		</div>
	);
}
