import { Buffer as BufferPolyfill } from "buffer";

if (!window.Buffer) {
	window.Buffer = BufferPolyfill;
}

if (!File.prototype.arrayBuffer) {
	File.prototype.arrayBuffer = function arrayBuffer() {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				resolve(reader.result as ArrayBuffer);
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(this);
		});
	};
}

if (!Blob.prototype.arrayBuffer) {
	Blob.prototype.arrayBuffer = function arrayBuffer() {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				resolve(reader.result as ArrayBuffer);
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(this);
		});
	};
}
