import { createContext, useContext } from "react";

interface ChatDiffContextValue {
	messageKey: string;
	workspacePath: string;
}

export const ChatDiffContext = createContext<ChatDiffContextValue>({
	messageKey: "message",
	workspacePath: "",
});

export function useChatDiffContext() {
	return useContext(ChatDiffContext);
}
