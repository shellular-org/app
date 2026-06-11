import {
	type HttpResponseDataMsg,
	type HttpResponseEndMsg,
	type HttpResponseStartMsg,
	MsgType,
} from "@shellular/protocol";
import bridge from "bridge/bridge";
import {
	getConnectionSnapshot,
	onBinaryHttpResponseData,
	onMessage,
	sendMessage,
	subscribeState,
} from "state/connection";

interface PendingRequest {
	nativeRequestId: string;
	requestUrl: string;
	resolveStart: (data: {
		status: number;
		statusText: string;
		headers: Record<string, string | string[]>;
	}) => void;
	resolveData: (chunk: string, index: number) => void;
	resolveEnd: () => void;
	resolveError: (error: string) => void;
}

const pending = new Map<string, PendingRequest>();
let cleanupFns: (() => void)[] = [];

declare global {
	interface Window {
		__shellularProxy: typeof __shellularProxy;
	}
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 4096;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
		);
	}
	return btoa(binary);
}

function stringToBase64(str: string): string {
	const bytes = new TextEncoder().encode(str);
	return uint8ArrayToBase64(bytes);
}

function logStaticAsset(
	url: string,
	status: number,
	contentType: string,
	contentLength: string,
	contentEncoding: string,
) {
	const lower = url.toLowerCase();
	if (
		lower.includes(".svg") ||
		lower.includes(".woff") ||
		lower.includes(".css") ||
		lower.includes(".js") ||
		lower.includes(".png") ||
		lower.includes(".jpg") ||
		lower.includes(".webp") ||
		lower.includes(".ttf") ||
		lower.includes(".wasm") ||
		lower.includes(".ico")
	) {
		console.log(
			"[Proxy] Static asset:",
			url,
			`status=${status}`,
			`Content-Type=${contentType || "?"}`,
			`Content-Length=${contentLength || "?"}`,
			`Content-Encoding=${contentEncoding || "none"}`,
		);
	}
}

const __shellularProxy = {
	httpRequest(
		requestId: string,
		method: string,
		url: string,
		headersJson: string,
		body: string,
	): void {
		const parsedHeaders: Record<string, string> = headersJson
			? JSON.parse(headersJson)
			: {};

		const fixedHeaders = ensureHostHeader(url, parsedHeaders);

		const msgId = sendMessage({
			type: MsgType.HTTP_REQUEST,
			data: {
				method,
				url,
				headers: fixedHeaders,
				body: body || undefined,
				...(body ? { bodyEncoding: "utf-8" as const } : {}),
			},
		});

		if (!msgId) {
			bridge("EmbeddedProxy")("responseError", [
				requestId,
				"WebSocket is not connected",
			]);
			return;
		}

		const isHttp = url.startsWith("http://");

		pending.set(msgId, {
			nativeRequestId: requestId,
			requestUrl: url,
			resolveStart: (data) => {
				const rewritten = rewriteCookieHeaders(data.headers, isHttp);
				const contentType = String(
					data.headers["Content-Type"] ?? data.headers["content-type"] ?? "",
				);
				const contentLength = String(
					data.headers["Content-Length"] ??
						data.headers["content-length"] ??
						"",
				);
				const contentEncoding = String(
					data.headers["Content-Encoding"] ??
						data.headers["content-encoding"] ??
						"",
				);
				logStaticAsset(
					url,
					data.status,
					contentType,
					contentLength,
					contentEncoding,
				);
				bridge("EmbeddedProxy")("responseStart", [
					requestId,
					data.status,
					data.statusText,
					JSON.stringify(rewritten),
				]);
			},
			resolveData: (chunk, index) => {
				bridge("EmbeddedProxy")("responseData", [requestId, chunk, index]);
			},
			resolveEnd: () => {
				pending.delete(msgId);
				bridge("EmbeddedProxy")("responseEnd", [requestId]);
			},
			resolveError: (error) => {
				pending.delete(msgId);
				bridge("EmbeddedProxy")("responseError", [requestId, error]);
			},
		});
	},
};

function ensureHostHeader(
	url: string,
	headers: Record<string, string>,
): Record<string, string> {
	try {
		const u = new URL(url);
		if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
			const host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
			const existingKey = Object.keys(headers).find(
				(k) => k.toLowerCase() === "host",
			);
			if (existingKey) {
				headers[existingKey] = host;
			} else {
				headers.Host = host;
			}
		}
	} catch (_) {}
	return headers;
}

function rewriteSetCookie(setCookie: string, isHttp: boolean): string {
	const parts = setCookie.split(";").map((p) => p.trim());
	const rewritten = parts.filter((part) => {
		const lower = part.toLowerCase();
		if (
			lower === "domain=localhost" ||
			lower === "domain=127.0.0.1" ||
			lower === "domain=0.0.0.0"
		) {
			return false;
		}
		if (isHttp && (lower === "secure" || lower.startsWith("secure="))) {
			return false;
		}
		return true;
	});
	return rewritten.join("; ");
}

function rewriteCookieHeaders(
	headers: Record<string, string | string[]>,
	isHttp: boolean,
): Record<string, string> {
	const result: Record<string, string> = {};

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === "set-cookie") {
			if (Array.isArray(value)) {
				result[key] = value.map((v) => rewriteSetCookie(v, isHttp)).join("\n");
			} else {
				result[key] = rewriteSetCookie(value, isHttp);
			}
		} else if (Array.isArray(value)) {
			result[key] = value.join(", ");
		} else {
			result[key] = value;
		}
	}

	return result;
}

function registerListeners() {
	cleanupFns.push(
		onMessage<HttpResponseStartMsg>(MsgType.HTTP_RESPONSE_START, (msg) => {
			const { requestId, status, statusText, headers } = msg.data;
			const req = pending.get(requestId);
			if (req) req.resolveStart({ status, statusText, headers });
		}),
	);

	cleanupFns.push(
		onMessage<HttpResponseDataMsg>(MsgType.HTTP_RESPONSE_DATA, (msg) => {
			const { requestId, chunk, index } = msg.data;
			const req = pending.get(requestId);
			if (req) {
				const base64 = stringToBase64(chunk);
				req.resolveData(base64, index);
			}
		}),
	);

	cleanupFns.push(
		onMessage<HttpResponseEndMsg>(MsgType.HTTP_RESPONSE_END, (msg) => {
			const { requestId } = msg.data;
			const req = pending.get(requestId);
			if (req) {
				if (msg.error) {
					req.resolveError(msg.error);
				} else {
					req.resolveEnd();
				}
			}
		}),
	);

	cleanupFns.push(
		onBinaryHttpResponseData((binaryMsg) => {
			const req = pending.get(binaryMsg.requestId);
			if (req) {
				const base64 = uint8ArrayToBase64(binaryMsg.data);
				req.resolveData(base64, binaryMsg.chunkIndex);
			}
		}),
	);
}

function unregisterListeners() {
	for (const fn of cleanupFns) fn();
	cleanupFns = [];
}

export function initProxyBridge(): void {
	window.__shellularProxy = __shellularProxy;

	registerListeners();

	let lastStatus = getConnectionSnapshot().connectionStatus;

	subscribeState(() => {
		const current = getConnectionSnapshot().connectionStatus;
		if (current !== lastStatus) {
			lastStatus = current;
			unregisterListeners();
			registerListeners();
		}
	});
}
