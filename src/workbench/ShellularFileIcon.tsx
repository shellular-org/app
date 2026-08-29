import {
	createFileTreeIconResolver,
	type FileTreeIconConfig,
	getBuiltInSpriteSheet,
} from "@pierre/trees";
import type { CSSProperties } from "react";

export const SHELLULAR_TREE_ICONS = {
	set: "standard",
	colored: false,
} satisfies FileTreeIconConfig;

export const TREE_ICON_THEME_STYLE = {
	"--trees-icon-gray": "var(--secondary-text)",
	"--trees-icon-red": "var(--danger)",
	"--trees-icon-vermilion": "var(--danger)",
	"--trees-icon-orange": "var(--warning)",
	"--trees-icon-yellow": "var(--warning)",
	"--trees-icon-green": "var(--success)",
	"--trees-icon-teal": "var(--success)",
	"--trees-icon-cyan": "var(--info)",
	"--trees-icon-blue": "var(--accent)",
	"--trees-icon-indigo": "var(--accent)",
	"--trees-icon-purple": "var(--accent)",
	"--trees-icon-pink": "var(--danger)",
	"--trees-icon-mauve": "var(--secondary-text)",
} as CSSProperties;

const iconResolver = createFileTreeIconResolver(SHELLULAR_TREE_ICONS);
const spriteSheet = getBuiltInSpriteSheet("standard");

const TOKEN_PALETTE: Record<string, string> = {
	astro: "purple",
	babel: "yellow",
	bash: "green",
	biome: "blue",
	bootstrap: "indigo",
	browserslist: "yellow",
	bun: "mauve",
	c: "blue",
	claude: "orange",
	cpp: "blue",
	css: "indigo",
	database: "purple",
	default: "gray",
	docker: "blue",
	eslint: "indigo",
	font: "purple",
	git: "vermilion",
	go: "cyan",
	graphql: "pink",
	html: "orange",
	image: "pink",
	javascript: "yellow",
	json: "orange",
	markdown: "green",
	mcp: "teal",
	nextjs: "gray",
	npm: "red",
	oxc: "cyan",
	postcss: "red",
	prettier: "teal",
	python: "blue",
	react: "cyan",
	ruby: "red",
	rust: "orange",
	sass: "pink",
	stylelint: "indigo",
	svelte: "red",
	svg: "orange",
	svgo: "green",
	swift: "orange",
	table: "teal",
	tailwind: "cyan",
	terraform: "indigo",
	text: "gray",
	typescript: "blue",
	vite: "purple",
	vscode: "blue",
	vue: "green",
	wasm: "indigo",
	webpack: "blue",
	yml: "red",
	zig: "orange",
	zip: "orange",
};

export function ShellularFileIconSprite() {
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute size-0 overflow-hidden"
			dangerouslySetInnerHTML={{ __html: spriteSheet }}
		/>
	);
}

export function ShellularFileIcon({
	path,
	className,
	color,
}: {
	path: string;
	className?: string;
	color?: string;
}) {
	const icon = iconResolver.resolveIcon("file-tree-icon-file", path);
	const palette = icon.token ? TOKEN_PALETTE[icon.token] : undefined;
	return (
		<svg
			aria-hidden="true"
			className={className}
			data-icon-name={icon.remappedFrom ?? icon.name}
			data-icon-token={icon.token}
			style={{
				color:
					color ??
					(palette
						? `var(--trees-icon-${palette}, var(--secondary-text))`
						: "var(--secondary-text)"),
			}}
			viewBox={icon.viewBox ?? `0 0 ${icon.width ?? 16} ${icon.height ?? 16}`}
			width={icon.width ?? 16}
			height={icon.height ?? 16}
		>
			<use href={`#${icon.name.replace(/^#/, "")}`} />
		</svg>
	);
}
