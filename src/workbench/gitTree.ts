import type { GitWorkingTreeFile } from "state";

export interface GitTreeNode {
	name: string;
	path: string;
	children: GitTreeNode[];
	file?: GitWorkingTreeFile;
}

export function buildGitTree(files: GitWorkingTreeFile[]): GitTreeNode[] {
	const root: GitTreeNode[] = [];
	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		const segments = file.path.split("/").filter(Boolean);
		let children = root;
		let currentPath = "";
		for (let index = 0; index < segments.length; index++) {
			const name = segments[index];
			currentPath = currentPath ? `${currentPath}/${name}` : name;
			const isFile = index === segments.length - 1;
			let node = children.find(
				(entry) => entry.name === name && Boolean(entry.file) === isFile,
			);
			if (!node) {
				node = {
					name,
					path: currentPath,
					children: [],
					file: isFile ? file : undefined,
				};
				children.push(node);
			}
			children = node.children;
		}
	}
	sortTree(root);
	return root;
}

function sortTree(nodes: GitTreeNode[]) {
	nodes.sort(
		(left, right) =>
			Number(Boolean(left.file)) - Number(Boolean(right.file)) ||
			left.name.localeCompare(right.name),
	);
	for (const node of nodes) sortTree(node.children);
}

export function collectGitTreeFiles(node: GitTreeNode): GitWorkingTreeFile[] {
	if (node.file) return [node.file];
	return node.children.flatMap(collectGitTreeFiles);
}
