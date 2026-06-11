import * as store from "lib/store";

interface Dimensions {
	x: number;
	y: number;
	h: number;
	w: number;
	r: number;
}

let video: HTMLVideoElement | null = null;
let barcodeDetector: BarcodeDetector | null = null;

let onScannerHideCallback: Callback | null = null;
let onScannerShowCallback: Callback | null = null;
let onScanCallback: Callback | null = null;
let scanOnce = false;

let scanning = false;
let togglingCamera = false;
let showing = false;

let cameraDevices: MediaDeviceInfo[] = [];

let preferredCamera: string | null = null;

export default {
	async init() {
		preferredCamera = await store.get<string>("preferredCamera");
		await loadCameraDevices();
		video = Object.assign(document.createElement("video"), {
			className: "fixed top-0 left-0 bg-black object-cover",
			controls: false,
			onclick: toggleCamera,
		}) as HTMLVideoElement;
		const track = Object.assign(document.createElement("track"), {
			kind: "captions",
		});
		video.appendChild(track);
		if ("BarcodeDetector" in window) {
			barcodeDetector = new BarcodeDetector({
				formats: ["qr_code", "ean_13", "code_128"],
			});
		}
	},

	/**
	 * Shows the scanner dialog.
	 * @param dimensions
	 * @returns
	 */
	async show(callback: Callback, [dimensions]: [Dimensions]) {
		if (!dimensions) {
			callback.error("Dimensions not provided");
			return;
		}

		if (!video) {
			await this.init();
		}
		const scannerVideo = getScannerVideo();

		const { x, y, h, w, r } = dimensions;

		if (!cameraDevices.length) {
			await loadCameraDevices();
		}

		scannerVideo.width = w;
		scannerVideo.height = h;
		scannerVideo.style.top = `${y}px`;
		scannerVideo.style.left = `${x}px`;
		scannerVideo.style.width = `${w}px`;
		scannerVideo.style.height = `${h}px`;
		scannerVideo.style.borderRadius = `${r}px`;
		scannerVideo.srcObject = await navigator.mediaDevices.getUserMedia({
			video: preferredCamera ? { deviceId: preferredCamera } : true,
			audio: false,
		});
		scannerVideo.crossOrigin = "anonymous";
		scannerVideo.playsInline = true;
		showing = true;
		document.body.append(scannerVideo);
		scannerVideo.onloadedmetadata = async () => {
			await scannerVideo.play();
			scanning = true;
			captureBarcode();
		};
		callback.success();
		if (onScannerShowCallback) {
			onScannerShowCallback.keep = true;
			onScannerShowCallback.success();
		}
	},
	hide(callback: Callback) {
		hideScanner();
		callback.success();
	},
	scan(callback: Callback, [arg1]: [boolean]) {
		scanOnce = arg1 === true;
		onScanCallback = callback;
	},
	setTheme(callback: Callback) {
		callback.success();
	},
	setOnShowListener(callback: Callback) {
		onScannerShowCallback = callback;
	},
	setOnHideListener(callback: Callback) {
		onScannerHideCallback = callback;
	},
};

async function loadCameraDevices() {
	cameraDevices = (await navigator.mediaDevices.enumerateDevices()).filter(
		(device) =>
			device.kind === "videoinput" &&
			device.label.toLowerCase().includes("back"),
	);
	if (!preferredCamera && cameraDevices.length) {
		preferredCamera = cameraDevices[0].deviceId;
		store.set("preferredCamera", preferredCamera).catch(console.error);
	}
}

async function captureBarcode() {
	if (!scanning || !barcodeDetector || !video) {
		return;
	}

	const barcodes = await barcodeDetector.detect(video);

	if (barcodes.length) {
		if (onScanCallback) {
			onScanCallback.keep = !scanOnce;
			onScanCallback.success(barcodes);
			if (scanOnce) {
				hideScanner();
				scanOnce = false;
			}
		}
	}

	requestAnimationFrame(captureBarcode);
}

async function toggleCamera() {
	if (cameraDevices.length <= 1 || togglingCamera || !video) {
		return;
	}
	togglingCamera = true;

	const currentMedia = video.srcObject;
	const currentDeviceId = (currentMedia as MediaStream)
		.getVideoTracks()[0]
		.getSettings().deviceId;
	const currentIndex = cameraDevices.findIndex(
		(camera) => camera.deviceId === currentDeviceId,
	);
	const nextIndex = (currentIndex + 1) % cameraDevices.length;
	preferredCamera = cameraDevices[nextIndex].deviceId;

	store.set("preferredCamera", preferredCamera).catch(console.error);
	for (const track of (currentMedia as MediaStream).getTracks()) {
		track.stop();
	}
	video.srcObject = await navigator.mediaDevices.getUserMedia({
		video: { deviceId: { exact: preferredCamera } },
		audio: false,
	});
	video.play();
	togglingCamera = false;
}

function hideScanner() {
	if (!showing || !video) return;

	const currentMedia = video.srcObject;
	const tracks =
		currentMedia instanceof MediaStream ? currentMedia.getTracks() : [];
	for (const track of tracks) {
		track.stop();
	}

	showing = false;
	scanning = false;
	video.pause();
	video.remove();
	if (onScannerHideCallback) {
		onScannerHideCallback.keep = false;
		onScannerHideCallback.success();
	}
}

function getScannerVideo(): HTMLVideoElement {
	if (!video) {
		throw new Error("Scanner video element was not initialized");
	}
	return video;
}
