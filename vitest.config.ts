import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(rootDir, "src");

export default defineConfig({
	resolve: {
		alias: {
			App: resolve(srcDir, "App.tsx"),
			bridge: resolve(srcDir, "bridge"),
			classes: resolve(srcDir, "classes"),
			components: resolve(srcDir, "components"),
			"context-menu": resolve(srcDir, "context-menu"),
			lang: resolve(srcDir, "lang"),
			lib: resolve(srcDir, "lib"),
			listeners: resolve(srcDir, "listeners"),
			pages: resolve(srcDir, "pages"),
			platforms: resolve(srcDir, "platforms"),
			polyfill: resolve(srcDir, "polyfill"),
			res: resolve(srcDir, "res"),
			state: resolve(srcDir, "state"),
			tabs: resolve(srcDir, "tabs"),
			themes: resolve(srcDir, "themes"),
			workbench: resolve(srcDir, "workbench"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		setupFiles: ["./src/test/setup.ts"],
	},
});
