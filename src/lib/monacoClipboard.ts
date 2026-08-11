import native from "bridge/native";

interface ClipboardBridge {
	readClipboardText(): Promise<string>;
	writeClipboardText(text: string): Promise<void>;
}

type ClipboardNavigator = Navigator & { clipboard?: Clipboard };

type ClipboardItemValue = string | Blob | PromiseLike<string | Blob>;
type ClipboardScope = {
	Blob: typeof Blob;
	ClipboardItem?: typeof ClipboardItem;
};

function ensureClipboardItem(scope: ClipboardScope) {
	if (typeof scope.ClipboardItem === "function") return scope.ClipboardItem;

	class ClipboardItemPolyfill {
		readonly presentationStyle = "unspecified";
		readonly types: string[];

		constructor(
			private readonly items: Record<string, ClipboardItemValue>,
			_options?: ClipboardItemOptions,
		) {
			this.types = Object.keys(items);
		}

		async getType(type: string) {
			if (!Object.prototype.hasOwnProperty.call(this.items, type)) {
				throw new DOMException(
					`Clipboard type ${type} is unavailable`,
					"NotFoundError",
				);
			}
			const value = await this.items[type];
			return value instanceof scope.Blob
				? value
				: new scope.Blob([value], { type });
		}

		static supports(type: string) {
			return type === "text/plain";
		}
	}

	try {
		Object.defineProperty(scope, "ClipboardItem", {
			configurable: true,
			value: ClipboardItemPolyfill,
		});
		return ClipboardItemPolyfill as unknown as typeof ClipboardItem;
	} catch {
		return null;
	}
}

async function clipboardItemText(item: ClipboardItem) {
	if (!item.types.includes("text/plain")) return null;
	const value = await item.getType("text/plain");
	return value.text();
}

export function installMonacoClipboardAdapter(
	target: ClipboardNavigator = navigator,
	bridge: ClipboardBridge = native,
	scope: ClipboardScope = globalThis,
) {
	const ClipboardItemConstructor = ensureClipboardItem(scope);
	const current = target.clipboard;
	if (
		current &&
		typeof current.write === "function" &&
		typeof current.writeText === "function" &&
		typeof current.readText === "function"
	) {
		return false;
	}

	const adapter = {
		async readText() {
			return bridge.readClipboardText();
		},
		async writeText(text: string) {
			await bridge.writeClipboardText(text);
		},
		async read() {
			const text = await bridge.readClipboardText();
			if (!ClipboardItemConstructor) return [];
			return [
				new ClipboardItemConstructor({
					"text/plain": new Blob([text], { type: "text/plain" }),
				}),
			];
		},
		async write(items: ClipboardItem[]) {
			for (const item of items) {
				try {
					const text = await clipboardItemText(item);
					if (text !== null) {
						await bridge.writeClipboardText(text);
						return;
					}
				} catch {
					// Monaco intentionally cancels a pending WebKit clipboard item on
					// the next gesture. Treat that internal cancellation as completion.
					return;
				}
			}
		},
	} as Clipboard;

	try {
		Object.defineProperty(target, "clipboard", {
			configurable: true,
			value: adapter,
		});
		return true;
	} catch {
		return false;
	}
}
