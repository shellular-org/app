/**
 * Fast file-type icon lookup using the shellular-app icon font.
 * Returns a CSS class string (`icon-*`) for use as className on a <span>.
 *
 * Priority: exact filename (case-insensitive) → file extension → fallback
 * Both lookups are O(1) Map accesses — no loops at call time.
 */

/** Maps exact lowercased filenames to icon classes */
const FILENAME_MAP: Record<string, string> = {
	// Docker
	dockerfile: "icon-docker",
	"dockerfile.dev": "icon-docker",
	"dockerfile.prod": "icon-docker",
	"docker-compose.yml": "icon-docker",
	"docker-compose.yaml": "icon-docker",
	"docker-compose.dev.yml": "icon-docker",
	"docker-compose.prod.yml": "icon-docker",
	".dockerignore": "icon-docker",

	// Git
	".gitignore": "icon-git",
	".gitattributes": "icon-git",
	".gitmodules": "icon-git",
	".gitkeep": "icon-git",
	".gitconfig": "icon-git",

	// npm / Node
	"package.json": "icon-npm",
	"package-lock.json": "icon-npm",
	".npmignore": "icon-npm",
	".npmrc": "icon-npm",
	".nvmrc": "icon-node-dot-js",
	".node-version": "icon-node-dot-js",

	// Yarn
	"yarn.lock": "icon-yarn",
	".yarnrc": "icon-yarn",
	".yarnrc.yml": "icon-yarn",

	// pnpm
	"pnpm-lock.yaml": "icon-npm",
	"pnpm-workspace.yaml": "icon-npm",
	".pnpmfile.cjs": "icon-npm",

	// Flutter / Dart
	"pubspec.yaml": "icon-flutter",
	"pubspec.lock": "icon-flutter",

	// Gradle
	"build.gradle": "icon-gradle",
	"build.gradle.kts": "icon-gradle",
	"settings.gradle": "icon-gradle",
	"settings.gradle.kts": "icon-gradle",
	gradlew: "icon-gradle",
	"gradle.properties": "icon-gradle",

	// Prettier
	".prettierrc": "icon-prettier",
	".prettierrc.json": "icon-prettier",
	".prettierrc.yml": "icon-prettier",
	".prettierrc.yaml": "icon-prettier",
	".prettierrc.js": "icon-prettier",
	".prettierrc.cjs": "icon-prettier",
	".prettierignore": "icon-prettier",

	// Tailwind
	"tailwind.config.js": "icon-tailwindcss",
	"tailwind.config.ts": "icon-tailwindcss",
	"tailwind.config.mjs": "icon-tailwindcss",
	"tailwind.config.cjs": "icon-tailwindcss",

	// Next.js
	"next.config.js": "icon-next-dot-js",
	"next.config.ts": "icon-next-dot-js",
	"next.config.mjs": "icon-next-dot-js",

	// Rollup
	"rollup.config.js": "icon-rollup-dot-js",
	"rollup.config.ts": "icon-rollup-dot-js",
	"rollup.config.mjs": "icon-rollup-dot-js",

	// Jest
	"jest.config.js": "icon-jest",
	"jest.config.ts": "icon-jest",
	"jest.config.mjs": "icon-jest",
	"jest.config.cjs": "icon-jest",

	// Svelte
	"svelte.config.js": "icon-svelte",
	"svelte.config.ts": "icon-svelte",

	// Vue
	"vue.config.js": "icon-vue-dot-js",
	"vue.config.ts": "icon-vue-dot-js",

	// GraphQL
	".graphqlrc": "icon-graphql",

	// Electron
	"electron.js": "icon-electron",
	"electron.ts": "icon-electron",
	"electron-builder.yml": "icon-electron",
	"electron-builder.json": "icon-electron",

	// Deno
	"deno.json": "icon-deno",
	"deno.jsonc": "icon-deno",
	"deno.lock": "icon-deno",

	// Angular
	"angular.json": "icon-angular",
	".angular-cli.json": "icon-angular",

	// Vite
	"vite.config.js": "icon-javascript",
	"vite.config.ts": "icon-typescript",
	"vite.config.mjs": "icon-javascript",

	// Webpack
	"webpack.config.js": "icon-javascript",
	"webpack.config.ts": "icon-typescript",
	"webpack.config.mjs": "icon-javascript",

	// ESLint
	".eslintrc": "icon-javascript",
	".eslintrc.js": "icon-javascript",
	".eslintrc.cjs": "icon-javascript",
	".eslintrc.json": "icon-javascript",
	".eslintrc.yml": "icon-javascript",
	".eslintignore": "icon-javascript",

	// Babel
	"babel.config.js": "icon-javascript",
	"babel.config.json": "icon-javascript",
	".babelrc": "icon-javascript",
};

/** Maps lowercased file extensions (without dot) to icon classes */
const EXTENSION_MAP: Record<string, string> = {
	// TypeScript
	ts: "icon-typescript",
	tsx: "icon-typescript",
	mts: "icon-typescript",
	cts: "icon-typescript",

	// JavaScript
	js: "icon-javascript",
	jsx: "icon-javascript",
	mjs: "icon-javascript",
	cjs: "icon-javascript",

	// HTML / markup
	html: "icon-html5",
	htm: "icon-html5",
	xhtml: "icon-html5",
	ejs: "icon-html5",
	hbs: "icon-html5",
	handlebars: "icon-html5",
	pug: "icon-html5",

	// CSS
	css: "icon-css3",
	scss: "icon-sass",
	sass: "icon-sass",
	less: "icon-css3",
	styl: "icon-css3",

	// Python
	py: "icon-python",
	pyw: "icon-python",
	pyi: "icon-python",
	pyc: "icon-python",

	// Java
	java: "icon-java",
	class: "icon-java",
	jar: "icon-java",

	// Kotlin
	kt: "icon-kotlin",
	kts: "icon-kotlin",

	// Dart / Flutter
	dart: "icon-dart",

	// Go
	go: "icon-go",
	mod: "icon-go",

	// Swift
	swift: "icon-swift",

	// GraphQL
	graphql: "icon-graphql",
	gql: "icon-graphql",

	// Jupyter
	ipynb: "icon-jupyter",

	// Vue
	vue: "icon-vue-dot-js",

	// Svelte
	svelte: "icon-svelte",

	// PowerShell
	ps1: "icon-powershell",
	psm1: "icon-powershell",
	psd1: "icon-powershell",

	// Shell scripts
	sh: "icon-terminal",
	bash: "icon-terminal",
	zsh: "icon-terminal",
	fish: "icon-terminal",
	ksh: "icon-terminal",

	// Markdown
	md: "icon-markdown",
	markdown: "icon-markdown",
	mdx: "icon-markdown",

	// Text / docs
	rst: "icon-file-text",
	txt: "icon-file-text",
	log: "icon-file-text",

	// Data / config
	json: "icon-code",
	jsonc: "icon-code",
	json5: "icon-code",
	yaml: "icon-code",
	yml: "icon-code",
	toml: "icon-code",
	ini: "icon-code",
	env: "icon-code",
	conf: "icon-code",
	config: "icon-code",
	xml: "icon-code",

	// Code (no dedicated brand icon)
	rs: "icon-code",
	rb: "icon-code",
	php: "icon-code",
	c: "icon-code",
	cpp: "icon-code",
	cc: "icon-code",
	cxx: "icon-code",
	h: "icon-code",
	hpp: "icon-code",
	hxx: "icon-code",
	cs: "icon-dot-net",
	lua: "icon-code",
	r: "icon-r",
	m: "icon-code",
	mm: "icon-code",
	pl: "icon-code",
	pm: "icon-code",
	ex: "icon-code",
	exs: "icon-code",
	erl: "icon-code",
	hs: "icon-haskell",
	ml: "icon-ocaml",
	mli: "icon-ocaml",
	fs: "icon-code",
	fsx: "icon-code",
	clj: "icon-code",
	cljs: "icon-code",
	scala: "icon-code",
	groovy: "icon-gradle",
	vim: "icon-vim",

	// SQL / Database
	sql: "icon-database",
	sqlite: "icon-database",
	db: "icon-database",
	psql: "icon-postgresql",

	// Images
	png: "icon-image",
	jpg: "icon-image",
	jpeg: "icon-image",
	gif: "icon-image",
	webp: "icon-image",
	ico: "icon-image",
	bmp: "icon-image",
	tiff: "icon-image",
	tif: "icon-image",
	svg: "icon-image",
	avif: "icon-image",
	heic: "icon-image",

	// Archives
	zip: "icon-archive",
	tar: "icon-archive",
	gz: "icon-archive",
	bz2: "icon-archive",
	xz: "icon-archive",
	"7z": "icon-archive",
	rar: "icon-archive",
	tgz: "icon-archive",

	// Document
	pdf: "icon-file-text",
	csv: "icon-file-text",

	// Android
	apk: "icon-android",
	aab: "icon-android",
};

/**
 * Returns the CSS class for the icon font glyph that best represents
 * the given filename. Falls back to `icon-file` for unknown types.
 *
 * @example
 * getFileIcon('index.ts')      // 'icon-typescript'
 * getFileIcon('Dockerfile')    // 'icon-docker'
 * getFileIcon('image.png')     // 'icon-image'
 * getFileIcon('unknown.xyz')   // 'icon-file'
 */
export function getFileIcon(filename: string): string {
	const lower = filename.toLowerCase();

	// 1. Exact filename match (highest priority)
	const byName = FILENAME_MAP[lower];
	if (byName) return byName;

	// 2. Extension match
	const dot = lower.lastIndexOf(".");
	if (dot !== -1) {
		const ext = lower.slice(dot + 1);
		const byExt = EXTENSION_MAP[ext];
		if (byExt) return byExt;
	}

	// 3. Fallback
	return "icon-file";
}
