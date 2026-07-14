import { pushPage } from "App";
import dialog from "bridge/dialog";
import FilePage from "pages/files";
import { useCallback, useState } from "react";
import { useShellular } from "state";

export default function useProjectPicker() {
	const { addProject } = useShellular();
	const [adding, setAdding] = useState(false);

	const handleProjectSelected = useCallback(
		async (path: string) => {
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
			} finally {
				setAdding(false);
			}
		},
		[addProject],
	);

	const openProjectPicker = useCallback(() => {
		pushPage(
			"project-picker",
			<FilePage mode="picker" onSelectFolder={handleProjectSelected} />,
		);
	}, [handleProjectSelected]);

	return { adding, openProjectPicker };
}
