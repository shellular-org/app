import bridge from "./bridge";

const encryption = bridge("Encryption");

export default {
	/**
	 * Encrypts the given data using the specified key.
	 * @param {any} data - The data to be encrypted.
	 * @param {string} key - The encryption key.
	 * @returns {Promise<string>} The encrypted data.
	 */
	encrypt(data: unknown, key: string): Promise<string> {
		if (!data) {
			throw new Error("Data to be encrypted is required");
		}
		if (!key) {
			throw new Error("Encryption key is required");
		}
		return encryption("encrypt", [data, key]) as Promise<string>;
	},
	/**
	 * Decrypts the given data using the specified key.
	 * @param {string} data - The data to be decrypted.
	 * @param {string} key - The key used for decryption.
	 * @returns {Promise<string>} - The decrypted data.
	 */
	decrypt(data: string, key: string): Promise<string> {
		return encryption("decrypt", [data, key]) as Promise<string>;
	},
};
