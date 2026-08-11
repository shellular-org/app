import sodium from "libsodium-wrappers";

let _ready = false;
const PROXY_BINARY_MAGIC = new Uint8Array([0x53, 0x48, 0x50, 0x42]);
const PROXY_BINARY_VERSION = 1;
const PROXY_BINARY_KIND_HTTP_RESPONSE_DATA = 1;
const PROXY_BINARY_KIND_TCP_TUNNEL_DATA = 2;
const PROXY_BINARY_HEADER_BYTES = 4 + 1 + 1 + 1 + 24;
export const TCP_TUNNEL_MAX_FRAME_BYTES = 64 * 1024;
const textDecoder = new TextDecoder();

export async function initSodium(): Promise<void> {
	if (_ready) return;
	await sodium.ready;
	_ready = true;
}

export interface ParsedConnection {
	hostId: string;
	encryptionKey: Uint8Array;
}

export function formatConnectionString(
	hostId: string,
	base64Key: string,
): string {
	return `${hostId}:${base64Key}`;
}

/**
 * Parse a QR / manual-entry string.
 *
 * Format: `{hostId}:{base64Key}` — split on the first `:`.
 */
export function parseConnectionString(raw: string): ParsedConnection {
	const idx = raw.indexOf(":");
	if (idx === -1) {
		throw new Error("Encryption key is missing!");
	}

	const hostId = raw.slice(0, idx);
	const base64Key = raw.slice(idx + 1);

	const key = sodium.from_base64(base64Key, sodium.base64_variants.ORIGINAL);

	if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
		throw new Error(
			`Invalid encryption key: expected ${sodium.crypto_secretbox_KEYBYTES} bytes, got ${key.length}`,
		);
	}

	return { hostId, encryptionKey: key };
}

/** Messages that are always sent as plaintext (relay needs to read them). */
export function isPlaintextMessage(type: string): boolean {
	return type.startsWith("session:") || type === "ping" || type === "pong";
}

export interface EncryptedEnvelope {
	id: string;
	type: "encrypted";
	clientId: string;
	nonce: string;
	ciphertext: string;
}

export interface ProxyBinaryHttpResponseData {
	kind: typeof PROXY_BINARY_KIND_HTTP_RESPONSE_DATA;
	clientId: string;
	requestId: string;
	chunkIndex: number;
	data: Uint8Array;
}

export interface ProxyBinaryTcpTunnelData {
	kind: typeof PROXY_BINARY_KIND_TCP_TUNNEL_DATA;
	clientId: string;
	tunnelId: string;
	sequence: number;
	data: Uint8Array;
}

export type ProxyBinaryData =
	| ProxyBinaryHttpResponseData
	| ProxyBinaryTcpTunnelData;

/**
 * Encrypt a fully-formed message object (already has `id`).
 * Returns the encrypted envelope to send on the wire.
 */
export function encryptMessage(
	msg: { id: string; type: string; clientId: string },
	key: Uint8Array,
): EncryptedEnvelope {
	const plaintext = JSON.stringify(msg);
	const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
	const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);

	return {
		id: msg.id,
		type: "encrypted",
		clientId: msg.clientId,
		nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
		ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
	};
}

/**
 * Decrypt an encrypted envelope.
 * Returns the parsed inner message, or `null` on failure (silent drop).
 */
export function decryptMessage(
	envelope: { nonce: string; ciphertext: string },
	key: Uint8Array,
): Record<string, unknown> | null {
	try {
		const nonce = sodium.from_base64(
			envelope.nonce,
			sodium.base64_variants.ORIGINAL,
		);
		const ciphertext = sodium.from_base64(
			envelope.ciphertext,
			sodium.base64_variants.ORIGINAL,
		);
		const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
		return JSON.parse(sodium.to_string(plaintext));
	} catch {
		console.warn("[E2EE] Failed to decrypt message, dropping");
		return null;
	}
}

export function decryptProxyBinaryFrame(
	frame: ArrayBuffer,
	key: Uint8Array,
): ProxyBinaryData | null {
	try {
		const bytes = new Uint8Array(frame);
		if (bytes.length < PROXY_BINARY_HEADER_BYTES) return null;

		for (let i = 0; i < PROXY_BINARY_MAGIC.length; i++) {
			if (bytes[i] !== PROXY_BINARY_MAGIC[i]) return null;
		}

		const version = bytes[4];
		const kind = bytes[5];
		const clientIdLength = bytes[6];
		if (
			version !== PROXY_BINARY_VERSION ||
			(kind !== PROXY_BINARY_KIND_HTTP_RESPONSE_DATA &&
				kind !== PROXY_BINARY_KIND_TCP_TUNNEL_DATA) ||
			clientIdLength === 0
		) {
			return null;
		}

		const nonceStart = 7;
		const nonceEnd = nonceStart + sodium.crypto_secretbox_NONCEBYTES;
		const clientIdStart = PROXY_BINARY_HEADER_BYTES;
		const clientIdEnd = clientIdStart + clientIdLength;
		if (bytes.length <= clientIdEnd) return null;

		const nonce = bytes.subarray(nonceStart, nonceEnd);
		const clientId = textDecoder.decode(
			bytes.subarray(clientIdStart, clientIdEnd),
		);
		const ciphertext = bytes.subarray(clientIdEnd);
		const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
		if (plaintext.length < 8) return null;

		const view = new DataView(
			plaintext.buffer,
			plaintext.byteOffset,
			plaintext.byteLength,
		);
		const plaintextKind = view.getUint8(0);
		const plaintextClientIdLength = view.getUint8(1);
		const requestIdLength = view.getUint16(2, false);
		const chunkIndex = view.getUint32(4, false);
		const clientIdPayloadStart = 8;
		const requestIdStart = clientIdPayloadStart + plaintextClientIdLength;
		const dataStart = requestIdStart + requestIdLength;
		if (
			plaintextKind !== kind ||
			plaintextClientIdLength === 0 ||
			plaintext.length < dataStart
		) {
			return null;
		}

		const plaintextClientId = textDecoder.decode(
			plaintext.subarray(clientIdPayloadStart, requestIdStart),
		);
		if (plaintextClientId !== clientId) return null;

		const identifier = textDecoder.decode(
			plaintext.subarray(requestIdStart, dataStart),
		);
		if (kind === PROXY_BINARY_KIND_TCP_TUNNEL_DATA) {
			const data = plaintext.subarray(dataStart);
			if (
				identifier.length < 8 ||
				identifier.length > 96 ||
				data.byteLength === 0 ||
				data.byteLength > TCP_TUNNEL_MAX_FRAME_BYTES
			) {
				return null;
			}
			return {
				kind,
				clientId,
				tunnelId: identifier,
				sequence: chunkIndex,
				data,
			};
		}
		return {
			kind,
			clientId,
			requestId: identifier,
			chunkIndex,
			data: plaintext.subarray(dataStart),
		};
	} catch {
		console.warn("[E2EE] Failed to decrypt proxy binary frame, dropping");
		return null;
	}
}

export function encryptTcpTunnelDataFrame(
	clientId: string,
	tunnelId: string,
	sequence: number,
	data: Uint8Array,
	key: Uint8Array,
): Uint8Array {
	if (data.byteLength > TCP_TUNNEL_MAX_FRAME_BYTES) {
		throw new Error("TCP tunnel frame is too large");
	}
	const clientIdBytes = new TextEncoder().encode(clientId);
	const tunnelIdBytes = new TextEncoder().encode(tunnelId);
	if (clientIdBytes.length === 0 || clientIdBytes.length > 255) {
		throw new Error("Invalid client ID");
	}
	if (tunnelIdBytes.length === 0 || tunnelIdBytes.length > 65_535) {
		throw new Error("Invalid tunnel ID");
	}
	const plaintext = new Uint8Array(
		8 + clientIdBytes.length + tunnelIdBytes.length + data.length,
	);
	const plaintextView = new DataView(plaintext.buffer);
	plaintextView.setUint8(0, PROXY_BINARY_KIND_TCP_TUNNEL_DATA);
	plaintextView.setUint8(1, clientIdBytes.length);
	plaintextView.setUint16(2, tunnelIdBytes.length, false);
	plaintextView.setUint32(4, sequence, false);
	plaintext.set(clientIdBytes, 8);
	plaintext.set(tunnelIdBytes, 8 + clientIdBytes.length);
	plaintext.set(data, 8 + clientIdBytes.length + tunnelIdBytes.length);

	const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
	const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);
	const frame = new Uint8Array(
		PROXY_BINARY_HEADER_BYTES + clientIdBytes.length + ciphertext.length,
	);
	frame.set(PROXY_BINARY_MAGIC, 0);
	frame[4] = PROXY_BINARY_VERSION;
	frame[5] = PROXY_BINARY_KIND_TCP_TUNNEL_DATA;
	frame[6] = clientIdBytes.length;
	frame.set(nonce, 7);
	frame.set(clientIdBytes, PROXY_BINARY_HEADER_BYTES);
	frame.set(ciphertext, PROXY_BINARY_HEADER_BYTES + clientIdBytes.length);
	return frame;
}

/**
 * Encode a raw Uint8Array key to standard base64 for persistence.
 */
export function keyToBase64(key: Uint8Array): string {
	return sodium.to_base64(key, sodium.base64_variants.ORIGINAL);
}

/**
 * Decode a base64-encoded key back to Uint8Array.
 */
export function keyFromBase64(base64: string): Uint8Array {
	return sodium.from_base64(base64, sodium.base64_variants.ORIGINAL);
}
