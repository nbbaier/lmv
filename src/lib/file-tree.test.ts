import { describe, expect, test } from "bun:test";
import {
	buildFileTree,
	filterTree,
	flattenVisibleNodes,
} from "./file-tree";

const files = [
	{ path: "README.md", name: "README.md", mtimeMs: 10 },
	{ path: "docs/guide.md", name: "guide.md", mtimeMs: 30 },
	{ path: "docs/reference/api.md", name: "api.md", mtimeMs: 20 },
];

describe("file tree", () => {
	test("keeps folders ahead of files and flattens expanded hierarchy", () => {
		const tree = buildFileTree(files, "name-asc");
		const visible = flattenVisibleNodes(
			tree,
			new Set(["docs", "docs/reference"]),
			new Set(),
		);

		expect(visible.map(({ node, depth }) => [node.path, depth])).toEqual([
			["docs", 0],
			["docs/reference", 1],
			["docs/reference/api.md", 2],
			["docs/guide.md", 1],
			["README.md", 0],
		]);
	});

	test("filters on full paths and auto-expands matching ancestors", () => {
		const tree = buildFileTree(files, "name-asc");
		const filtered = filterTree(tree, "reference/api");
		const visible = flattenVisibleNodes(
			filtered.nodes,
			new Set(),
			filtered.autoExpand,
		);

		expect(filtered.autoExpand).toEqual(new Set(["docs/reference", "docs"]));
		expect(visible.map(({ node }) => node.path)).toEqual([
			"docs",
			"docs/reference",
			"docs/reference/api.md",
		]);
	});
});
