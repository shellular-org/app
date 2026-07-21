export interface LicenseEntry {
	name: string;
	license: string;
	url: string;
}

export interface LicenseGroup {
	category: string;
	icon: string;
	entries: LicenseEntry[];
}

const licenses: LicenseGroup[] = [
	{
		category: "UI Framework",
		icon: "icon-code",
		entries: [
			{
				name: "React",
				license: "MIT",
				url: "https://github.com/facebook/react",
			},
			{
				name: "React DOM",
				license: "MIT",
				url: "https://github.com/facebook/react",
			},
			{
				name: "Framer Motion",
				license: "MIT",
				url: "https://github.com/motiondivision/motion",
			},
			{
				name: "Tailwind CSS",
				license: "MIT",
				url: "https://github.com/tailwindlabs/tailwindcss",
			},
			{
				name: "Headless UI",
				license: "MIT",
				url: "https://github.com/tailwindlabs/headlessui",
			},
		],
	},
	{
		category: "Agent Protocol",
		icon: "icon-ai-chat",
		entries: [
			{
				name: "Agent Client Protocol SDK",
				license: "Apache-2.0",
				url: "https://github.com/agentclientprotocol/typescript-sdk",
			},
		],
	},
	{
		category: "Editor",
		icon: "icon-file-text",
		entries: [
			{
				name: "Monaco Editor",
				license: "MIT",
				url: "https://github.com/microsoft/monaco-editor",
			},
			{
				name: "Monaco Editor Webpack Plugin",
				license: "MIT",
				url: "https://github.com/microsoft/monaco-editor/tree/main/webpack-plugin",
			},
			{
				name: "CodeMirror",
				license: "MIT",
				url: "https://github.com/codemirror/dev",
			},
			{
				name: "Lezer Highlight",
				license: "MIT",
				url: "https://github.com/lezer-parser/highlight",
			},
		],
	},
	{
		category: "Terminal",
		icon: "icon-terminal",
		entries: [
			{
				name: "xterm.js",
				license: "MIT",
				url: "https://github.com/xtermjs/xterm.js",
			},
		],
	},
	{
		category: "Charts & Visualization",
		icon: "icon-bar-chart-2",
		entries: [
			{
				name: "Chart.js",
				license: "MIT",
				url: "https://github.com/chartjs/Chart.js",
			},
			{
				name: "react-chartjs-2",
				license: "MIT",
				url: "https://github.com/reactchartjs/react-chartjs-2",
			},
		],
	},
	{
		category: "Security & Crypto",
		icon: "icon-shield",
		entries: [
			{
				name: "libsodium.js",
				license: "ISC",
				url: "https://github.com/jedisct1/libsodium.js",
			},
			{
				name: "DOMPurify",
				license: "MPL-2.0 / Apache-2.0",
				url: "https://github.com/cure53/DOMPurify",
			},
		],
	},
	{
		category: "Utilities",
		icon: "icon-package",
		entries: [
			{
				name: "Marked",
				license: "MIT",
				url: "https://github.com/markedjs/marked",
			},
			{
				name: "Zod",
				license: "MIT",
				url: "https://github.com/colinhacks/zod",
			},
			{
				name: "Autosize",
				license: "MIT",
				url: "https://github.com/jackmoore/autosize",
			},
			{
				name: "Buffer",
				license: "MIT",
				url: "https://github.com/feross/buffer",
			},
			{
				name: "base64-arraybuffer",
				license: "MIT",
				url: "https://github.com/niklasvh/base64-arraybuffer",
			},
			{
				name: "core-js",
				license: "MIT",
				url: "https://github.com/zloirock/core-js",
			},
			{
				name: "Eruda",
				license: "MIT",
				url: "https://github.com/liriliri/eruda",
			},
			{
				name: "resize-observer-polyfill",
				license: "MIT",
				url: "https://github.com/que-etc/resize-observer-polyfill",
			},
			{
				name: "clsx",
				license: "MIT",
				url: "https://github.com/lukeed/clsx",
			},
			{
				name: "jsQR",
				license: "Apache-2.0",
				url: "https://github.com/cozmo/jsQR",
			},
		],
	},
];

export default licenses;
