import { gunzipSync, gzipSync } from "fflate";
import sodium from "libsodium-wrappers";

/**
 * Below this, gzip's header outweighs what it saves. Mirrors the CLI's
 * threshold; the two do not need to agree (each message is self-describing via
 * `enc`), but keeping them equal makes the wire behaviour predictable.
 */
const COMPRESS_MIN_BYTES = 4 * 1024;

/**
 * fflate is used rather than the native DecompressionStream API because the
 * inbound message path is synchronous — going async there would restructure
 * every caller of decryptMessage for no benefit.
 */
let _ready = false;
const PROXY_BINARY_MAGIC = new Uint8Array([0x53, 0x48, 0x50, 0x42]);
const PROXY_BINARY_VERSION = 1;
const PROXY_BINARY_KIND_HTTP_RESPONSE_DATA = 1;
const PROXY_BINARY_HEADER_BYTES = 4 + 1 + 1 + 1 + 24;
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
	nonce: string;
	ciphertext: string;
	/** Encoding applied before encryption. Absent = raw UTF-8 JSON. */
	enc?: "gzip";
}

export interface ProxyBinaryHttpResponseData {
	kind: typeof PROXY_BINARY_KIND_HTTP_RESPONSE_DATA;
	clientId: string;
	requestId: string;
	chunkIndex: number;
	data: Uint8Array;
}

/**
 * Encrypt a fully-formed message object (already has `id`).
 * Returns the encrypted envelope to send on the wire.
 */
/**
 * @param allowCompression whether the connected CLI can decode `enc: "gzip"`.
 *   Defaults to false so any caller that has not established the host's
 *   capabilities emits the universally-readable format.
 */
export function encryptMessage(
	msg: { id: string; type: string },
	key: Uint8Array,
	allowCompression = false,
): EncryptedEnvelope {
	const plaintext = JSON.stringify(msg);
	const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
	// Compress before encrypting: ciphertext is incompressible, and the relay
	// reads only the envelope's routing fields, so this stays end-to-end.
	const raw = new TextEncoder().encode(plaintext);
	const compress = allowCompression && raw.byteLength >= COMPRESS_MIN_BYTES;
	const payload = compress ? gzipSync(raw) : raw;
	const ciphertext = sodium.crypto_secretbox_easy(payload, nonce, key);

	return {
		id: msg.id,
		type: "encrypted",
		nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
		ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
		...(compress ? { enc: "gzip" as const } : {}),
	};
}

/**
 * Decrypt an encrypted envelope.
 * Returns the parsed inner message, or `null` on failure (silent drop).
 */
export function decryptMessage(
	envelope: { nonce: string; ciphertext: string; enc?: "gzip" },
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
		// No `enc` means a peer that predates compression: raw UTF-8 JSON.
		if (envelope.enc === "gzip") {
			return JSON.parse(new TextDecoder().decode(gunzipSync(plaintext)));
		}
		return JSON.parse(sodium.to_string(plaintext));
	} catch {
		console.warn("[E2EE] Failed to decrypt message, dropping");
		return null;
	}
}

export function decryptProxyBinaryFrame(
	frame: ArrayBuffer,
	key: Uint8Array,
): ProxyBinaryHttpResponseData | null {
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
			kind !== PROXY_BINARY_KIND_HTTP_RESPONSE_DATA ||
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

		return {
			kind: PROXY_BINARY_KIND_HTTP_RESPONSE_DATA,
			clientId,
			requestId: textDecoder.decode(
				plaintext.subarray(requestIdStart, dataStart),
			),
			chunkIndex,
			data: plaintext.subarray(dataStart),
		};
	} catch {
		console.warn("[E2EE] Failed to decrypt proxy binary frame, dropping");
		return null;
	}
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
