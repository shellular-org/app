import { describe, expect, it, vi } from "vitest";
import { installMonacoClipboardAdapter } from "./monacoClipboard";

function setup() {
	const target = {} as Navigator & { clipboard?: Clipboard };
	const scope = { Blob } as {
		Blob: typeof Blob;
		ClipboardItem?: typeof ClipboardItem;
	};
	const bridge = {
		readClipboardText: vi.fn(async () => "from pasteboard"),
		writeClipboardText: vi.fn(async () => undefined),
	};
	expect(installMonacoClipboardAdapter(target, bridge, scope)).toBe(true);
	return {
		bridge,
		clipboard: target.clipboard as Clipboard,
		ClipboardItem: scope.ClipboardItem as typeof ClipboardItem,
	};
}

describe("macOS Monaco clipboard adapter", () => {
	it("routes text reads and writes through the native pasteboard", async () => {
		const { bridge, clipboard } = setup();
		await expect(clipboard.readText()).resolves.toBe("from pasteboard");
		await clipboard.writeText("copied");
		expect(bridge.writeClipboardText).toHaveBeenCalledWith("copied");
	});

	it("resolves Monaco ClipboardItem writes", async () => {
		const { bridge, clipboard, ClipboardItem } = setup();
		await clipboard.write([
			new ClipboardItem({ "text/plain": Promise.resolve("item text") }),
		]);
		expect(bridge.writeClipboardText).toHaveBeenCalledWith("item text");
	});

	it("absorbs expected canceled deferred writes", async () => {
		const { bridge, clipboard, ClipboardItem } = setup();
		await expect(
			clipboard.write([
				new ClipboardItem({
					"text/plain": Promise.reject(new Error("Canceled")),
				}),
			]),
		).resolves.toBeUndefined();
		expect(bridge.writeClipboardText).not.toHaveBeenCalled();
	});

	it("installs the ClipboardItem global Monaco's WebKit workaround requires", () => {
		const { ClipboardItem } = setup();
		const item = new ClipboardItem({ "text/plain": "copied" });
		expect(item.types).toEqual(["text/plain"]);
		expect(ClipboardItem.supports("text/plain")).toBe(true);
	});
});
