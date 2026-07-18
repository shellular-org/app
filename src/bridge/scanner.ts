import type Theme from "classes/theme";
import permissions from "lib/permissions";
import bridge from "./bridge";
import { bytesToBase64 } from "./file";
import native from "./native";

export const FORMAT_QR_CODE = 256;

type ScanResult = {
	rawValue: string;
	format: string;
	displayValue: string;
	valueType: string;
};

const scanner = bridge("Scanner");

const observer = {
	animationFrame: null as number | null,
	observe(element: HTMLElement) {
		this.stop();
		const update = () => {
			const rect = element.getBoundingClientRect();
			const dimensions = {
				x: rect.left,
				y: rect.top,
				w: rect.width,
				h: rect.height,
			};
			scanner("update", [dimensions]).catch((_) => {});
			this.animationFrame = requestAnimationFrame(update);
		};
		this.animationFrame = requestAnimationFrame(update);
	},
	stop() {
		if (this.animationFrame != null) {
			cancelAnimationFrame(this.animationFrame);
			this.animationFrame = null;
		}
	},
};

export default {
	async show(viewFinder: HTMLElement) {
		if (!(await native.hasPermission(permissions.CAMERA))) {
			await native.requestPermission(permissions.CAMERA);
		}

		const rect = viewFinder.getBoundingClientRect();
		const dimensions = {
			x: rect.left,
			y: rect.top,
			w: rect.width,
			h: rect.height,
		};
		try {
			await this.hide();
		} catch {}
		observer.observe(viewFinder);
		try {
			await scanner("show", [dimensions]);
		} catch {}
	},
	hide() {
		observer.stop();
		return scanner("hide");
	},
	scan(onScan: (result: ScanResult[] | null) => void) {
		Bridge.exec(
			(data) => onScan(data as ScanResult[] | null),
			console.error,
			"Scanner",
			"scan",
			[],
		);
	},
	async scanOnce(): Promise<ScanResult[] | null> {
		const res = (await scanner("scan", [true])) as ScanResult[] | null;
		observer.stop();
		return res;
	},
	async scanImage(file: File | Blob): Promise<ScanResult[] | null> {
		const buffer = await file.arrayBuffer();
		const base64 = bytesToBase64(new Uint8Array(buffer));
		return (await scanner("scanImage", [base64])) as ScanResult[] | null;
	},
	setTheme(theme: Theme) {
		return scanner("setTheme", [theme.json]);
	},
	setOnShowListener(listener: () => void) {
		Bridge.exec(listener, console.error, "Scanner", "setOnShowListener", []);
	},
	setOnHideListener(listener: () => void) {
		Bridge.exec(listener, console.error, "Scanner", "setOnHideListener", []);
	},
};
