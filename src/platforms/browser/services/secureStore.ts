const PREFIX = "shellular:secure:";

export default {
	get(callback: Callback, [key]: [string]) {
		localStorage.removeItem(PREFIX + key);
		callback.success(sessionStorage.getItem(PREFIX + key));
	},
	set(callback: Callback, [key, value]: [string, string]) {
		localStorage.removeItem(PREFIX + key);
		sessionStorage.setItem(PREFIX + key, value);
		callback.success();
	},
	remove(callback: Callback, [key]: [string]) {
		localStorage.removeItem(PREFIX + key);
		sessionStorage.removeItem(PREFIX + key);
		callback.success();
	},
};
