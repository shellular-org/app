import sodium from "libsodium-wrappers";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptMessage, encryptMessage, initSodium } from "./e2ee";

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
