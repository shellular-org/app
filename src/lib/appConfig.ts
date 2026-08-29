(() => {
	setTimeout(() => {
		console.log('dev mode: ', process.env.DEV_MODE);
		console.log(process.env.DEV_SERVER);
	}, 100);
})();

export default {
	DATA_DIR: "/files",
	CACHE_DIR: "/cache",
	BROWSER_CACHE_NAME: "app-cache-v1",
	DEFAULT_SERVER: process.env.DEV_MODE
		? (process.env.DEV_SERVER ?? "server.shellular.dev")
		: "server.shellular.dev",
};
