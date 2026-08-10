import type { GitWorkingTreeFile } from "state";

export type GitChangeTreeNode =
	| {
			type: "directory";
			name: string;
			path: string;
			fileCount: number;
			children: GitChangeTreeNode[];
	  }
	| {
			type: "file";
			name: string;
			path: string;
			file: GitWorkingTreeFile;
	  };

type MutableDirectory = {
	name: string;
	path: string;
	directories: Map<string, MutableDirectory>;
	files: GitChangeTreeNode[];
};

const NAME_COLLATOR = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

function sortNodes(nodes: GitChangeTreeNode[]): GitChangeTreeNode[] {
	return nodes.sort((left, right) => {
		if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
		return NAME_COLLATOR.compare(left.name, right.name);
	});
}

function finalizeDirectory(directory: MutableDirectory): GitChangeTreeNode[] {
	const childDirectories: GitChangeTreeNode[] = Array.from(
		directory.directories.values(),
	).map((child) => {
		const children = finalizeDirectory(child);
		return {
			type: "directory",
			name: child.name,
			path: child.path,
			fileCount: countFiles(children),
			children,
		};
	});

	return sortNodes([...childDirectories, ...directory.files]);
}

function countFiles(nodes: GitChangeTreeNode[]): number {
	let count = 0;
	for (const node of nodes) {
		count += node.type === "file" ? 1 : node.fileCount;
	}
	return count;
}

function flattenDirectory(node: GitChangeTreeNode): GitChangeTreeNode {
	if (node.type === "file") return node;

	let flattened: GitChangeTreeNode = {
		...node,
		children: node.children.map(flattenDirectory),
	};

	while (
		flattened.type === "directory" &&
		flattened.children.length === 1 &&
		flattened.children[0].type === "directory"
	) {
		const onlyChild: Extract<GitChangeTreeNode, { type: "directory" }> =
			flattened.children[0];
		flattened = {
			...onlyChild,
			name: `${flattened.name} / ${onlyChild.name}`,
		};
	}

	return flattened;
}

/**
 * Builds the compact directory tree used by the Git changes view.
 * Git paths are usually POSIX-style, but backslashes are accepted so changes
 * from Windows hosts render with the same hierarchy.
 */
export function buildGitChangeTree(
	files: GitWorkingTreeFile[],
): GitChangeTreeNode[] {
	const root: MutableDirectory = {
		name: "",
		path: "",
		directories: new Map(),
		files: [],
	};

	for (const file of files) {
		const parts = file.path.split(/[\\/]+/).filter(Boolean);
		const fileName = parts.pop() || file.path;
		let directory = root;
		const pathParts: string[] = [];

		for (const part of parts) {
			pathParts.push(part);
			let child = directory.directories.get(part);
			if (!child) {
				child = {
					name: part,
					path: pathParts.join("/"),
					directories: new Map(),
					files: [],
				};
				directory.directories.set(part, child);
			}
			directory = child;
		}

		directory.files.push({
			type: "file",
			name: fileName,
			path: file.path,
			file,
		});
	}

	return finalizeDirectory(root).map(flattenDirectory);
}
