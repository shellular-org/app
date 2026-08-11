import sodium from "libsodium-wrappers";
import { beforeAll, describe, expect, it } from "vitest";
import {
	decryptMessage,
	decryptProxyBinaryFrame,
	encryptMessage,
	encryptTcpTunnelDataFrame,
	initSodium,
	TCP_TUNNEL_MAX_FRAME_BYTES,
} from "./e2ee";

describe("encrypted message identity", () => {
	beforeAll(async () => {
		await initSodium();
	});

	it("copies the authenticated client ID into the outer envelope and ciphertext", () => {
		const key = sodium.crypto_secretbox_keygen();
		const envelope = encryptMessage(
			{
				id: "request-1",
				type: "fs:list",
				clientId: "c_local-test",
			},
			key,
		);

		expect(envelope.clientId).toBe("c_local-test");
		expect(decryptMessage(envelope, key)).toMatchObject({
			id: "request-1",
			type: "fs:list",
			clientId: "c_local-test",
		});
	});
});

describe("encrypted TCP tunnel frames", () => {
	beforeAll(async () => {
		await initSodium();
	});

	it("round-trips the routing identity, sequence, and opaque bytes", () => {
		const key = sodium.crypto_secretbox_keygen();
		const payload = new TextEncoder().encode("ordered tunnel bytes");
		const frame = encryptTcpTunnelDataFrame(
			"client-123",
			"tunnel-123",
			42,
			payload,
			key,
		);

		const decoded = decryptProxyBinaryFrame(
			Uint8Array.from(frame).buffer,
			key,
		);
		expect(decoded).toMatchObject({
			clientId: "client-123",
			tunnelId: "tunnel-123",
			sequence: 42,
		});
		expect(Array.from(decoded?.data ?? [])).toEqual(Array.from(payload));
	});

	it("rejects oversized data and tampered routing headers", () => {
		const key = sodium.crypto_secretbox_keygen();
		expect(() =>
			encryptTcpTunnelDataFrame(
				"client-123",
				"tunnel-123",
				0,
				new Uint8Array(TCP_TUNNEL_MAX_FRAME_BYTES + 1),
				key,
			),
		).toThrow("too large");

		const frame = encryptTcpTunnelDataFrame(
			"client-123",
			"tunnel-123",
			0,
			new Uint8Array([1, 2, 3]),
			key,
		);
		frame[31] ^= 1;
		expect(
			decryptProxyBinaryFrame(Uint8Array.from(frame).buffer, key),
		).toBeNull();
	});
});
