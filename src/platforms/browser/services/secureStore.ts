const PREFIX = "shellular:secure:";

export default {
	get(callback: Callback, [key]: [string]) {
		callback.success(localStorage.getItem(PREFIX + key));
	},
	set(callback: Callback, [key, value]: [string, string]) {
		localStorage.setItem(PREFIX + key, value);
		callback.success();
	},
	remove(callback: Callback, [key]: [string]) {
		localStorage.removeItem(PREFIX + key);
		callback.success();
	},
};
