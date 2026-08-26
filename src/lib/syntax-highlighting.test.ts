import { describe, expect, test } from "bun:test";
import type { Element, Root } from "hast";
import { rehypeHighlight } from "./syntax-highlighting";

function highlight(language: string, value: string) {
	const code: Element = {
		type: "element",
		tagName: "code",
		properties: { className: [`language-${language}`] },
		children: [{ type: "text", value }],
	};
	const tree: Root = {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "pre",
				properties: {},
				children: [code],
			},
		],
	};

	rehypeHighlight()(tree);
	return code;
}

describe("rehypeHighlight", () => {
	test("highlights a registered language alias", () => {
		const code = highlight("js", "const answer = 42;");

		expect(code.properties.className).toEqual(["hljs", "language-js"]);
		expect(JSON.stringify(code.children)).toContain("hljs-keyword");
	});

	test("leaves an unregistered language untouched", () => {
		const code = highlight("brainfuck", "++>---");

		expect(code.properties.className).toEqual(["language-brainfuck"]);
		expect(code.children).toEqual([{ type: "text", value: "++>---" }]);
	});
});
