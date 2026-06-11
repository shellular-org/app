import bridge from "./bridge";

const device = bridge("Device");

export default {
	/**
	 * Get the device id
	 * @returns {Promise<string>}
	 */
	id(): Promise<string> {
		return device("id") as Promise<string>;
	},
};
