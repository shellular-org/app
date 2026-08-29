import { pushPage } from "App";
import dialog from "bridge/dialog";
import native from "bridge/native";
import FilePage from "pages/files";
import { useCallback, useState } from "react";
import { useShellular } from "state";
import { getConnectionSnapshot } from "state/connection";

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
		const connection = getConnectionSnapshot();
		if (process.env.IS_MACOS && connection.transport === "local") {
			void (async () => {
				const rootPath = connection.hostInfo?.dir;
				if (!rootPath) {
					await dialog.message("Connect to This Mac before opening a folder.");
					return;
				}
				try {
					const selected = await native.pickLocalDirectory(rootPath);
					if (selected) await handleProjectSelected(selected);
				} catch (error) {
					await dialog.message(
						(error as Error).message,
						"Unable to Open Folder",
					);
				}
			})();
			return;
		}
		pushPage(
			"project-picker",
			<FilePage mode="picker" onSelectFolder={handleProjectSelected} />,
		);
	}, [handleProjectSelected]);

	return { adding, openProjectPicker };
}
