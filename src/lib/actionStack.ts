import dialog from "bridge/dialog";
import native from "bridge/native";

type Action = {
	id: string;
	action: () => void | boolean | Promise<void | boolean>;
	freeze?: boolean;
};
type BaseActionEvent = "pop" | "push" | "remove";
type ActionEvent = BaseActionEvent | `on${BaseActionEvent}`;
type ActionEventListener = (action: Action) => void;

const stack: Action[] = [];
const listeners: Record<ActionEvent, ActionEventListener[]> = {
	push: [],
	pop: [],
	remove: [],
	onpush: [],
	onpop: [],
	onremove: [],
};
let freeze = false;
let popPending = false;

const actionStack = {
	/**
	 * Pushes an action to stack
	 */
	push(action: Action) {
		stack.push(action);
		emit("push", action);
	},
	/**
	 * Pops an action
	 */
	async pop() {
		if (freeze || popPending) {
			return;
		}

		const action = stack.pop();

		if (action?.freeze) {
			stack.push(action);
			return;
		}

		if (!action) {
			exiApp();
			return;
		}

		popPending = true;
		try {
			const result = await action.action();
			if (result !== false) {
				emit("pop", action);
				emit("remove", action);
				return;
			}
			stack.push(action);
			emit("push", action);
		} catch (error) {
			stack.push(action);
			emit("push", action);
			throw error;
		} finally {
			popPending = false;
		}
	},
	/**
	 * Clears the stack
	 */
	clear() {
		stack.length = 0;
	},
	/**
	 * Removes an action from stack by id and returns true if found
	 */
	remove(id: string): boolean {
		for (let i = 0; i < stack.length; i += 1) {
			const action = stack[i];
			if (action.id === id) {
				stack.splice(i, 1);
				emit("remove", action);
				return true;
			}
		}

		return false;
	},
	/**
	 * Returns true if an action with given id exists in stack
	 */
	has(id: string): boolean {
		return Boolean(stack.find((action) => action.id === id));
	},
	/**
	 * Replaces an existing action while preserving its stack position.
	 */
	replace(action: Action): boolean {
		const index = stack.findIndex((item) => item.id === action.id);
		if (index === -1) return false;
		stack[index] = action;
		return true;
	},
	/**
	 * Adds an event listener
	 * @param {'pop'|'push'|'remove'} event
	 * @param {() => void} listener
	 */
	on(event: ActionEvent, listener: ActionEventListener) {
		if (event in listeners) {
			listeners[event].push(listener);
		}
	},
	/**
	 * Removes an event listener
	 */
	off(event: ActionEvent, listener: ActionEventListener) {
		if (event in listeners) {
			const index = listeners[event].indexOf(listener);
			if (index > -1) {
				listeners[event].splice(index, 1);
			}
		}
	},
	set freeze(value) {
		freeze = value;
	},
	get freeze() {
		return freeze;
	},
	get length() {
		return stack.length;
	},
	onpush(_action?: Action) {},
	onpop(_action?: Action) {},
	onremove(_action?: Action) {},
};

export default actionStack;

/**
 * Emits an event to all registered listeners
 */
function emit(event: BaseActionEvent, data: Action) {
	if (!Array.isArray(listeners[event])) return;

	const listener = actionStack[`on${event}` as `on${BaseActionEvent}`];
	if (listener && typeof listener === "function") {
		try {
			listener(data);
		} catch (err) {
			console.error(
				`Error in actionStack on${event} handler: ${errorMessage(err)}`,
			);
		}
	}

	for (const listener of Array.from(listeners[event])) {
		try {
			listener(data);
		} catch (err) {
			console.error(
				`Error in actionStack listener for event ${event}: ${errorMessage(err)}`,
			);
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Shows exit message and close app when confirmed
 */
async function exiApp() {
	if (await dialog.confirm("Exit app?")) {
		native.exitApp();
	}
}
