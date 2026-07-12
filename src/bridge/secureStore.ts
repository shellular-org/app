import bridge from "./bridge";

const secureStore = bridge("SecureStore");

export default {
	get(key: string): Promise<string | null> {
		return secureStore("get", [key]) as Promise<string | null>;
	},
	set(key: string, value: string): Promise<void> {
		return secureStore("set", [key, value]) as Promise<void>;
	},
	remove(key: string): Promise<void> {
		return secureStore("remove", [key]) as Promise<void>;
	},
};
