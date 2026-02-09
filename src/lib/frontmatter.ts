import { parse } from "yaml";

export type Frontmatter = Record<string, unknown>;

export interface ParsedContent {
	frontmatter: Frontmatter | null;
	body: string;
}

const FRONTMATTER_RE = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

export function parseFrontmatter(raw: string): ParsedContent {
	const match = raw.match(FRONTMATTER_RE);
	if (!match) {
		return { frontmatter: null, body: raw };
	}

	try {
		const parsed = parse(match[1]!);
		if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { frontmatter: null, body: raw };
		}
		const body = raw.slice(match[0].length);
		return { frontmatter: parsed as Frontmatter, body };
	} catch {
		return { frontmatter: null, body: raw };
	}
}
