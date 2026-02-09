export type SortOrder =
	| "name-asc"
	| "name-desc"
	| "modified-desc"
	| "modified-asc";

export type ApiFile = {
	path: string; // posix-ish relative path
	name: string;
	mtimeMs?: number;
	isSymlink?: boolean;
	error?: string;
};

export type TreeNode =
	| {
			kind: "folder";
			path: string; // posix-ish, no trailing slash
			name: string;
			mtimeMs: number;
			children: TreeNode[];
	  }
	| {
			kind: "file";
			path: string;
			name: string;
			mtimeMs: number;
			isSymlink: boolean;
			error?: string;
	  };

function compareStrings(a: string, b: string) {
	return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function sortChildren(nodes: TreeNode[], sortOrder: SortOrder) {
	const byNameAsc = (a: TreeNode, b: TreeNode) =>
		compareStrings(a.name, b.name);
	const byNameDesc = (a: TreeNode, b: TreeNode) =>
		-compareStrings(a.name, b.name);
	const byMtimeDesc = (a: TreeNode, b: TreeNode) => b.mtimeMs - a.mtimeMs;
	const byMtimeAsc = (a: TreeNode, b: TreeNode) => a.mtimeMs - b.mtimeMs;

	const cmp =
		sortOrder === "name-asc"
			? byNameAsc
			: sortOrder === "name-desc"
				? byNameDesc
				: sortOrder === "modified-asc"
					? byMtimeAsc
					: byMtimeDesc;

	const folders = nodes.filter((n) => n.kind === "folder").sort(cmp);
	const files = nodes.filter((n) => n.kind === "file").sort(cmp);
	return [...folders, ...files];
}

function normalizePath(p: string) {
	return p.replaceAll("\\", "/");
}

function pathSegments(p: string) {
	return normalizePath(p).split("/").filter(Boolean);
}

function computeMtimeMs(file: ApiFile) {
	return typeof file.mtimeMs === "number" ? file.mtimeMs : 0;
}

function recomputeFolderMtime(node: Extract<TreeNode, { kind: "folder" }>) {
	let max = 0;
	for (const child of node.children) {
		if (child.kind === "folder") {
			recomputeFolderMtime(child);
		}
		if (child.mtimeMs > max) max = child.mtimeMs;
	}
	node.mtimeMs = max;
}

export function buildFileTree(files: ApiFile[], sortOrder: SortOrder) {
	const root: Extract<TreeNode, { kind: "folder" }> = {
		kind: "folder",
		path: "",
		name: "",
		mtimeMs: 0,
		children: [],
	};

	const folderIndex = new Map<string, Extract<TreeNode, { kind: "folder" }>>([
		["", root],
	]);

	for (const file of files) {
		const segments = pathSegments(file.path);
		if (segments.length === 0) continue;

		let currentPath = "";
		let parent = root;

		for (let i = 0; i < segments.length - 1; i++) {
			const seg = segments[i]!;
			const folderPath = currentPath ? `${currentPath}/${seg}` : seg;
			currentPath = folderPath;

			let folder = folderIndex.get(folderPath);
			if (!folder) {
				folder = {
					kind: "folder",
					path: folderPath,
					name: seg,
					mtimeMs: 0,
					children: [],
				};
				folderIndex.set(folderPath, folder);
				parent.children.push(folder);
			}

			parent = folder;
		}

		const name = segments[segments.length - 1]!;
		parent.children.push({
			kind: "file",
			path: normalizePath(file.path),
			name,
			mtimeMs: computeMtimeMs(file),
			isSymlink: Boolean(file.isSymlink),
			error: file.error,
		});
	}

	recomputeFolderMtime(root);

	const sortRec = (node: Extract<TreeNode, { kind: "folder" }>) => {
		node.children = sortChildren(node.children, sortOrder);
		for (const child of node.children) {
			if (child.kind === "folder") sortRec(child);
		}
	};
	sortRec(root);

	return root.children;
}

export function filterTree(
	nodes: TreeNode[],
	filterText: string,
): { nodes: TreeNode[]; autoExpand: Set<string> } {
	const q = filterText.trim().toLowerCase();
	if (!q) return { nodes, autoExpand: new Set() };

	const autoExpand = new Set<string>();

	const matchesFile = (path: string) =>
		normalizePath(path).toLowerCase().includes(q);

	const filterRec = (node: TreeNode): TreeNode | null => {
		if (node.kind === "file") return matchesFile(node.path) ? node : null;

		const children = node.children
			.map(filterRec)
			.filter((c): c is TreeNode => Boolean(c));

		if (children.length === 0) return null;
		autoExpand.add(node.path);
		return { ...node, children };
	};

	return {
		nodes: nodes.map(filterRec).filter((n): n is TreeNode => Boolean(n)),
		autoExpand,
	};
}

export type VisibleNode = {
	node: TreeNode;
	depth: number;
};

export function flattenVisibleNodes(
	nodes: TreeNode[],
	expandedFolders: Set<string>,
	autoExpand: Set<string>,
) {
	const out: VisibleNode[] = [];

	const walk = (node: TreeNode, depth: number) => {
		out.push({ node, depth });
		if (node.kind === "folder") {
			const expanded =
				expandedFolders.has(node.path) || autoExpand.has(node.path);
			if (!expanded) return;
			for (const child of node.children) walk(child, depth + 1);
		}
	};

	for (const node of nodes) walk(node, 0);
	return out;
}
