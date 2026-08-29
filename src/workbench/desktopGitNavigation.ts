type Listener = (projectPath?: string) => void;

const listeners = new Set<Listener>();

export function focusDesktopGit(projectPath?: string) {
	for (const listener of listeners) listener(projectPath);
}

export function subscribeDesktopGitFocus(listener: Listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
