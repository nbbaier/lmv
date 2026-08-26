import { toText } from "hast-util-to-text";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import type { Element, Root } from "hast";
import { createLowlight } from "lowlight";
import { visit } from "unist-util-visit";

const highlighter = createLowlight({
	bash,
	c,
	cpp,
	css,
	diff,
	go,
	java,
	javascript,
	json,
	markdown,
	python,
	rust,
	sql,
	typescript,
	xml,
	yaml,
});

function language(node: Element) {
	const classes = node.properties.className;
	if (!Array.isArray(classes)) return;

	for (const className of classes) {
		const value = String(className);
		if (value === "no-highlight" || value === "nohighlight") return false;
		if (value.startsWith("lang-")) return value.slice(5);
		if (value.startsWith("language-")) return value.slice(9);
	}
}

export function rehypeHighlight() {
	return (tree: Root) => {
		visit(tree, "element", (node, _, parent) => {
			if (
				node.tagName !== "code" ||
				parent?.type !== "element" ||
				parent.tagName !== "pre"
			) {
				return;
			}

			const name = language(node);
			if (!name || !highlighter.registered(name)) return;

			const result = highlighter.highlight(name, toText(node, { whitespace: "pre" }));
			const classes = Array.isArray(node.properties.className)
				? node.properties.className
				: [];
			node.properties.className = classes.includes("hljs")
				? classes
				: ["hljs", ...classes];
			node.children = result.children.filter((child) => child.type !== "doctype");
		});
	};
}
