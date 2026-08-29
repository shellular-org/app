type NewChatRequest = { projectPath?: string };
type Listener = (request: NewChatRequest) => void;

const listeners = new Set<Listener>();

export function requestNewChat(projectPath?: string) {
	for (const listener of listeners) listener({ projectPath });
}

export function subscribeNewChat(listener: Listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
