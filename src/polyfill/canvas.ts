// polyfill canvas.toBlob if it doesn't exist

if (!HTMLCanvasElement.prototype.toBlob) {
	Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
		value(
			this: HTMLCanvasElement,
			callback: BlobCallback,
			type?: string,
			quality?: number,
		) {
			const dataURL = this.toDataURL(type, quality);
			const buffer = atob(dataURL.split(",")[1]);
			const array = new Uint8Array(buffer.length);
			for (let i = 0; i < buffer.length; i++) {
				array[i] = buffer.charCodeAt(i);
			}

			const blob = new Blob([array], { type: type || "image/png" });
			callback(blob);
		},
	});
}
