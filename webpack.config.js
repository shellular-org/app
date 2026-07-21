import { existsSync, mkdirSync, readFileSync, rm } from "node:fs";
import { join, resolve } from "node:path";
import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";
import {
	defineReactCompilerLoaderOption,
	reactCompilerLoader,
} from "react-compiler-webpack";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";
import packageJson from "./package.json" with { type: "json" };

const PLATFORMS = join(process.cwd(), "platforms");
const ANDROID_BUNDLE = join(PLATFORMS, "android/app/src/main/assets/bundle");
const BROWSER_BUNDLE = join(PLATFORMS, "browser/bundle");
const IOS_BUNDLE = join(PLATFORMS, "ios/shellular/bundle");
const MACOS_BUNDLE = join(PLATFORMS, "macos/shellular/bundle");
const MIXINS = `@use "${join(process.cwd(), "src/mixins.scss")}" as *;`;
const DESKTOP_UI_PLATFORMS = new Set(["browser", "macos", "windows", "linux"]);

if (!existsSync(ANDROID_BUNDLE)) {
	mkdirSync(ANDROID_BUNDLE, { recursive: true });
}

if (!existsSync(BROWSER_BUNDLE)) {
	mkdirSync(BROWSER_BUNDLE, { recursive: true });
}

if (!existsSync(IOS_BUNDLE)) {
	mkdirSync(IOS_BUNDLE, { recursive: true });
}
if (!existsSync(MACOS_BUNDLE)) {
	mkdirSync(MACOS_BUNDLE, { recursive: true });
}

export default (_, { env = {}, mode = "development" }) => {
	const isDev = mode === "development";
	const {
		platform = "android",
		host,
		port,
		console: compileConsole = false,
	} = env;
	const isDesktopUI = DESKTOP_UI_PLATFORMS.has(platform);
	const outputPath =
		platform === "browser"
			? BROWSER_BUNDLE
			: platform === "ios"
				? IOS_BUNDLE
				: platform === "macos"
					? MACOS_BUNDLE
					: ANDROID_BUNDLE;

	let alias;
	if (isDev) {
		console.log(`dev server: ${host}:${port}`);
		alias = {
			// assuming app & packages are in the same monorepo, adjust as needed
			"@shellular/protocol": resolve("../packages/protocol/dist/index.js"),
		};
	} else if (!compileConsole) {
		clearOutputDir(outputPath);
	}

	const reactCompilerLoaderConfig = {
		loader: reactCompilerLoader,
		options: defineReactCompilerLoaderOption({
			// React Compiler options goes here
		}),
	};

	const devBabelLoaderConfig = {
		loader: "babel-loader",
		options: {
			presets: [
				"@babel/preset-typescript",
				["@babel/preset-react", { runtime: "automatic" }],
			],
			plugins: ["react-refresh/babel"],
		},
	};

	const tsLoaderConfig = {
		loader: "ts-loader",
		options: {
			transpileOnly: true,
		},
	};

	const appConfig = {
		mode,
		target: "web",
		stats: "minimal",
		entry: {
			main: "./src/boot.ts",
		},
		resolve: {
			extensions: [".ts", ".tsx", ".js", ".jsx"],
			modules: ["node_modules", "src"],
			alias,
			fallback: {
				buffer: "buffer",
			},
		},
		watchOptions: {
			ignored: ["**/node_modules", "**/bundle"],
		},
		output: {
			path: outputPath,
			filename: "[name].js",
			chunkFilename: "[name].chunk.js",
			publicPath: isDev ? "/" : "./",
			environment: {
				const: false,
				forOf: false,
				module: false,
				arrowFunction: false,
				bigIntLiteral: false,
				destructuring: false,
				dynamicImport: false,
			},
		},
		...(isDev && host && port
			? {
					devServer: {
						host,
						port: Number(port),
						hot: true,
						static: false,
						allowedHosts: "all",
						historyApiFallback: true,
						client: {
							webSocketURL: {
								hostname: host,
								port: Number(port),
								protocol: platform === "browser" ? "wss" : "ws",
								pathname: "/ws",
							},
						},
						...(platform !== "browser"
							? {
									devMiddleware: {
										writeToDisk: true,
									},
								}
							: {}),
						...(platform === "browser"
							? {
									server: "https",
									headers: (request) => {
										const isAuthCallback =
											new URL(
												request.url ?? "/",
												"https://shellular.local",
											).searchParams.get("shellularAuthCallback") === "1";
										return isAuthCallback
											? { "Cross-Origin-Opener-Policy": "unsafe-none" }
											: {
													"Cross-Origin-Opener-Policy":
														"same-origin-allow-popups",
													"Cross-Origin-Embedder-Policy": "require-corp",
												};
									},
								}
							: {}),
					},
				}
			: {}),
		module: {
			rules: [
				{
					test: /\.m.(sa|sc|c)ss$/,
					use: [
						"raw-loader",
						"postcss-loader",
						{
							loader: "sass-loader",
							options: {
								additionalData: MIXINS,
							},
						},
					],
				},
				{
					test: /\.tsx?$/,
					exclude: /node_modules/,
					use: [
						reactCompilerLoaderConfig,
						isDev ? devBabelLoaderConfig : tsLoaderConfig,
					],
				},
				{
					test: /\.sql$/i,
					use: "raw-loader",
				},
				{
					test: /(?<!\.m)\.(sa|sc|c)ss$/,
					use: [
						isDev ? "style-loader" : { loader: MiniCssExtractPlugin.loader },
						"css-loader",
						"postcss-loader",
						{
							loader: "sass-loader",
							options: {
								sourceMap: isDev,
								additionalData: MIXINS,
							},
						},
					],
				},
				{
					test: /(index\.html|splash\.svg|favicon\.ico|manifest\.json|logo(-\d+)?\.png|logo-mono(-\d+)?\.png)/,
					type: "asset/resource",
					generator: {
						filename: "[name][ext]",
					},
				},
				{
					test: /shellular-app\.ttf$/,
					type: "asset/resource",
					generator: {
						filename: "[name][ext]",
					},
				},
				{
					test: /\.(png|svg|jpg|jpeg|ico|ttf|webp|eot|woff|icns)(\?.*)?$/,
					type: "asset/resource",
				},
			],
		},
		plugins: [
			...(isDesktopUI
				? [
						new MonacoWebpackPlugin({
							filename: "monaco/[name].worker.js",
							publicPath: "./",
						}),
					]
				: []),
			...(!isDev ? [new MiniCssExtractPlugin({ ignoreOrder: true })] : []),
			...(isDev ? [new ReactRefreshWebpackPlugin()] : []),
			{
				apply(compiler) {
					const cssPath = join(process.cwd(), "src/res/icons/style.css");

					compiler.hooks.thisCompilation.tap("EmitIconCSS", (compilation) => {
						compilation.hooks.processAssets.tap(
							{
								name: "EmitIconCSS",
								stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
							},
							() => {
								compilation.emitAsset(
									"style.css",
									new webpack.sources.RawSource(readFileSync(cssPath)),
								);
							},
						);
					});
				},
			},
			new webpack.EnvironmentPlugin({
				DEV_MODE: isDev,
				PLATFORM: platform,
				ID: packageJson.name,
				VERSION: packageJson.version,
				IS_IOS: platform === "ios",
				IS_MACOS: platform === "macos",
				IS_BROWSER: platform === "browser",
				IS_ANDROID: platform === "android",
				IS_DESKTOP_UI: isDesktopUI,
				VERSION_CODE: packageJson.versionCode,
				DISPLAY_NAME: packageJson.displayName,
				HOST: isDev && host ? host : null,
				PORT: isDev && port ? port : null,
				ORIGIN: isDev && host && port ? `http://${host}:${port}` : null,
			}),
		],
		optimization: {
			minimizer: [
				new TerserPlugin({
					extractComments: false,
				}),
			],
		},
	};

	const consoleConfig = {
		mode: "production",
		devtool: false,
		entry: {
			console: "./src/console.ts",
		},
		output: {
			path: outputPath,
			filename: "[name].js",
			chunkFilename: "[name].chunk.js",
			publicPath: isDev ? "/" : "./",
			environment: {
				const: false,
				forOf: false,
				module: false,
				arrowFunction: false,
				bigIntLiteral: false,
				destructuring: false,
				dynamicImport: false,
			},
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					use: {
						loader: "ts-loader",
						options: {
							transpileOnly: true,
							compilerOptions: {
								target: "ES5",
								ignoreDeprecations: "6.0",
							},
						},
					},
				},
			],
		},
		plugins: [],
		optimization: {
			minimize: true,
			minimizer: [
				new TerserPlugin({
					extractComments: false,
					terserOptions: {
						ecma: 5,
						compress: {
							arrows: false,
						},
						format: {
							ecma: 5,
						},
					},
				}),
			],
		},
	};

	return compileConsole ? consoleConfig : appConfig;
};

/**
 * Clears the output directory by removing all files and directories except for specific ones.
 * @param {string} path - The path to the output directory.
 */
function clearOutputDir(path) {
	rm(path, { recursive: true, force: true }, (err) => {
		if (err) {
			process.stderr.write(err.message);
		}
	});
}
