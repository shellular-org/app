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
	onBinaryTcpTunnelData,
	onMessage,
	sendMessage,
	sendTcpTunnelData,
	subscribeState,
} from "state/connection";

const TCP_TUNNEL_OPEN = "tcp:tunnel:open";
const TCP_TUNNEL_OPENED = "tcp:tunnel:opened";
const TCP_TUNNEL_WINDOW = "tcp:tunnel:window";
const TCP_TUNNEL_END = "tcp:tunnel:end";
const TCP_TUNNEL_CLOSE = "tcp:tunnel:close";
const TCP_TUNNEL_CLOSED = "tcp:tunnel:closed";
const TCP_TUNNEL_INITIAL_WINDOW_BYTES = 1024 * 1024;
const TCP_TUNNEL_MAX_FRAME_BYTES = 64 * 1024;
const TCP_TUNNEL_ALLOWED_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"0.0.0.0",
]);

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
interface PendingTunnel {
	id: string;
	sendSequence: number;
	receiveSequence: number;
	sendCredit: number;
	receiveCredit: number;
}

type TunnelControlMessage = {
	id?: string;
	respTo?: string;
	type: string;
	error?: string;
	data: {
		tunnelId: string;
		windowBytes?: number;
		bytes?: number;
	};
};

const tunnels = new Map<string, PendingTunnel>();
let cleanupFns: (() => void)[] = [];

function parseTunnelControlMessage(
	value: unknown,
	expectedType: string,
): TunnelControlMessage | null {
	if (!value || typeof value !== "object") return null;
	const message = value as Partial<TunnelControlMessage>;
	if (
		message.type !== expectedType ||
		!message.data ||
		typeof message.data !== "object" ||
		typeof message.data.tunnelId !== "string" ||
		message.data.tunnelId.length < 8 ||
		message.data.tunnelId.length > 96 ||
		(message.error !== undefined &&
			(typeof message.error !== "string" || message.error.length > 512))
	) {
		return null;
	}
	if (
		message.data.windowBytes !== undefined &&
		(!Number.isInteger(message.data.windowBytes) ||
			message.data.windowBytes < 0 ||
			message.data.windowBytes > TCP_TUNNEL_INITIAL_WINDOW_BYTES)
	) {
		return null;
	}
	if (
		message.data.bytes !== undefined &&
		(!Number.isInteger(message.data.bytes) ||
			message.data.bytes < 1 ||
			message.data.bytes > TCP_TUNNEL_INITIAL_WINDOW_BYTES)
	) {
		return null;
	}
	return message as TunnelControlMessage;
}

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

function base64ToUint8Array(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function sendTunnelMessage(message: {
	type: string;
	data: Record<string, unknown>;
}): string | null {
	return sendMessage(message as never);
}

function nativeTunnelAction(action: string, args: unknown[]) {
	return bridge("EmbeddedProxy")(action, args).catch((error) => {
		console.error(`[TCP Tunnel] Native ${action} failed`, error);
	});
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

	tcpOpen(
		tunnelId: string,
		host: "localhost" | "127.0.0.1" | "::1" | "0.0.0.0",
		port: number,
	): void {
		if (
			tunnels.has(tunnelId) ||
			tunnelId.length < 8 ||
			tunnelId.length > 96 ||
			!TCP_TUNNEL_ALLOWED_HOSTS.has(host) ||
			!Number.isInteger(port) ||
			port < 1 ||
			port > 65_535 ||
			tunnels.size >= 64
		) {
			void nativeTunnelAction("tunnelClosed", [
				tunnelId,
				"Invalid or excessive TCP tunnel request",
			]);
			return;
		}
		const requestId = sendTunnelMessage({
			type: TCP_TUNNEL_OPEN,
			data: {
				tunnelId,
				host,
				port,
				initialWindowBytes: TCP_TUNNEL_INITIAL_WINDOW_BYTES,
			},
		});
		if (!requestId) {
			void nativeTunnelAction("tunnelClosed", [
				tunnelId,
				"The remote host is not connected",
			]);
			return;
		}
		tunnels.set(tunnelId, {
			id: tunnelId,
			sendSequence: 0,
			receiveSequence: 0,
			sendCredit: 0,
			receiveCredit: TCP_TUNNEL_INITIAL_WINDOW_BYTES,
		});
	},

	tcpData(tunnelId: string, chunkBase64: string): void {
		const tunnel = tunnels.get(tunnelId);
		if (!tunnel) return;
		const data = base64ToUint8Array(chunkBase64);
		if (
			data.byteLength === 0 ||
			data.byteLength > TCP_TUNNEL_MAX_FRAME_BYTES ||
			data.byteLength > tunnel.sendCredit
		) {
			__shellularProxy.tcpClose(tunnelId);
			return;
		}
		if (
			!sendTcpTunnelData(tunnelId, tunnel.sendSequence, data)
		) {
			__shellularProxy.tcpClose(tunnelId);
			return;
		}
		tunnel.sendSequence += 1;
		tunnel.sendCredit -= data.byteLength;
	},

	tcpConsumed(tunnelId: string, bytes: number): void {
		const tunnel = tunnels.get(tunnelId);
		if (!tunnel || bytes <= 0 || bytes > TCP_TUNNEL_MAX_FRAME_BYTES) return;
		tunnel.receiveCredit = Math.min(
			TCP_TUNNEL_INITIAL_WINDOW_BYTES,
			tunnel.receiveCredit + bytes,
		);
		sendTunnelMessage({
			type: TCP_TUNNEL_WINDOW,
			data: { tunnelId, bytes },
		});
	},

	tcpEnd(tunnelId: string): void {
		if (!tunnels.has(tunnelId)) return;
		sendTunnelMessage({ type: TCP_TUNNEL_END, data: { tunnelId } });
	},

	tcpClose(tunnelId: string): void {
		if (!tunnels.delete(tunnelId)) return;
		sendTunnelMessage({ type: TCP_TUNNEL_CLOSE, data: { tunnelId } });
		void nativeTunnelAction("tunnelClosed", [tunnelId, ""]);
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

	cleanupFns.push(
		onMessage<unknown>(TCP_TUNNEL_OPENED, (value) => {
			const msg = parseTunnelControlMessage(value, TCP_TUNNEL_OPENED);
			if (!msg) return;
			const tunnel = tunnels.get(msg.data.tunnelId);
			const credit = msg.data.windowBytes ?? 0;
			if (!tunnel || credit <= 0) return;
			tunnel.sendCredit = credit;
			void nativeTunnelAction("tunnelOpened", [
				tunnel.id,
				TCP_TUNNEL_INITIAL_WINDOW_BYTES,
				credit,
			]);
		}),
		onMessage<unknown>(TCP_TUNNEL_WINDOW, (value) => {
			const msg = parseTunnelControlMessage(value, TCP_TUNNEL_WINDOW);
			if (!msg) return;
			const tunnel = tunnels.get(msg.data.tunnelId);
			const bytes = msg.data.bytes ?? 0;
			if (!tunnel || bytes <= 0) return;
			tunnel.sendCredit = Math.min(
				TCP_TUNNEL_INITIAL_WINDOW_BYTES,
				tunnel.sendCredit + bytes,
			);
			void nativeTunnelAction("tunnelWindow", [tunnel.id, bytes]);
		}),
		onMessage<unknown>(TCP_TUNNEL_END, (value) => {
			const msg = parseTunnelControlMessage(value, TCP_TUNNEL_END);
			if (!msg) return;
			if (!tunnels.has(msg.data.tunnelId)) return;
			void nativeTunnelAction("tunnelEnd", [msg.data.tunnelId]);
		}),
		onMessage<unknown>(TCP_TUNNEL_CLOSED, (value) => {
			const msg = parseTunnelControlMessage(value, TCP_TUNNEL_CLOSED);
			if (!msg) return;
			if (!tunnels.delete(msg.data.tunnelId)) return;
			void nativeTunnelAction("tunnelClosed", [
				msg.data.tunnelId,
				msg.error ?? "",
			]);
		}),
		onBinaryTcpTunnelData((msg) => {
			const tunnel = tunnels.get(msg.tunnelId);
			if (
				!tunnel ||
				msg.sequence !== tunnel.receiveSequence ||
				msg.data.byteLength === 0 ||
				msg.data.byteLength > TCP_TUNNEL_MAX_FRAME_BYTES ||
				msg.data.byteLength > tunnel.receiveCredit
			) {
				if (tunnel) __shellularProxy.tcpClose(msg.tunnelId);
				return;
			}
			tunnel.receiveSequence += 1;
			tunnel.receiveCredit -= msg.data.byteLength;
			void nativeTunnelAction("tunnelData", [
				msg.tunnelId,
				uint8ArrayToBase64(msg.data),
				msg.sequence,
			]);
		}),
	);
}

function unregisterListeners() {
	for (const fn of cleanupFns) fn();
	cleanupFns = [];
}

function closeNativeTunnels(message: string) {
	for (const tunnelId of tunnels.keys()) {
		void nativeTunnelAction("tunnelClosed", [tunnelId, message]);
	}
	tunnels.clear();
}

export function initProxyBridge(): void {
	window.__shellularProxy = __shellularProxy;

	registerListeners();

	let lastStatus = getConnectionSnapshot().connectionStatus;

	subscribeState(() => {
		const current = getConnectionSnapshot().connectionStatus;
		if (current !== lastStatus) {
			if (current !== "connected") {
				closeNativeTunnels("The remote host disconnected");
			}
			lastStatus = current;
			unregisterListeners();
			registerListeners();
		}
	});
}
