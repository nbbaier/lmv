import { lstat, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

type DiscoverOptions = {
	cwd: string;
	recursive: boolean;
	includeHidden: boolean;
	strict?: boolean;
};

function toPosixPath(p: string) {
	return p.replaceAll("\\", "/");
}

function isGlobPattern(input: string) {
	return /[*?[\]{}()!]/.test(input);
}

function isHiddenPath(pathLike: string) {
	const normalized = toPosixPath(pathLike);
	const parts = normalized.split("/").filter(Boolean);
	return parts.some(
		(part) => part.startsWith(".") && part !== "." && part !== "..",
	);
}

function isMarkdownPath(pathLike: string) {
	const lower = pathLike.toLowerCase();
	return lower.endsWith(".md") || lower.endsWith(".markdown");
}

async function scanDirectory(
	dir: string,
	options: Pick<DiscoverOptions, "recursive" | "includeHidden">,
	out: Set<string>,
) {
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		if (!options.includeHidden && entry.name.startsWith(".")) continue;
		const absolutePath = resolve(dir, entry.name);

		if (entry.isDirectory()) {
			if (!options.recursive) continue;
			await scanDirectory(absolutePath, options, out);
			continue;
		}

		if (entry.isFile() || entry.isSymbolicLink()) {
			if (!isMarkdownPath(entry.name)) continue;
			out.add(absolutePath);
		}
	}
}

function filterByHidden(
	paths: string[],
	options: Pick<DiscoverOptions, "includeHidden">,
) {
	if (options.includeHidden) return paths;
	return paths.filter((p) => !isHiddenPath(p));
}

function filterByMarkdown(paths: string[]) {
	return paths.filter((p) => isMarkdownPath(p));
}

function uniqueInOrder(paths: string[]) {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const p of paths) {
		if (seen.has(p)) continue;
		seen.add(p);
		out.push(p);
	}
	return out;
}

async function filterGitIgnored(absolutePaths: string[], cwd: string) {
	if (absolutePaths.length === 0) return absolutePaths;
	if (!Bun.which("git")) return absolutePaths;

	const toplevel = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});

	if (toplevel.exitCode !== 0) return absolutePaths;
	const repoRoot = toplevel.stdout.toString().trim();
	if (!repoRoot) return absolutePaths;

	const relCandidates: string[] = [];
	const relToAbs = new Map<string, string>();

	for (const abs of absolutePaths) {
		const rel = toPosixPath(relative(repoRoot, abs));
		if (rel === ".." || rel.startsWith("../")) continue;
		relCandidates.push(rel);
		relToAbs.set(rel, abs);
	}

	if (relCandidates.length === 0) return absolutePaths;

	const input = new TextEncoder().encode(relCandidates.join("\0"));
	const ignored = Bun.spawnSync(["git", "check-ignore", "-z", "--stdin"], {
		cwd: repoRoot,
		stdin: input,
		stdout: "pipe",
		stderr: "pipe",
	});

	if (ignored.exitCode !== 0 && ignored.exitCode !== 1) return absolutePaths;

	const ignoredRel = ignored.stdout.toString().split("\0").filter(Boolean);
	const ignoredSet = new Set<string>(ignoredRel);

	return absolutePaths.filter((abs) => {
		const rel = toPosixPath(relative(repoRoot, abs));
		if (!relToAbs.has(rel)) return true;
		return !ignoredSet.has(rel);
	});
}

export async function discoverMarkdownFiles(
	inputs: string[],
	options: DiscoverOptions,
) {
	const discovered = new Set<string>();
	const strict = options.strict !== false;

	for (const input of inputs) {
		if (isGlobPattern(input)) {
			const glob = new Bun.Glob(input);
			const matches: string[] = [];
			for await (const match of glob.scan({ cwd: options.cwd })) {
				matches.push(resolve(options.cwd, match));
			}
			for (const p of filterByMarkdown(filterByHidden(matches, options))) {
				discovered.add(p);
			}
			continue;
		}

		const absolutePath = resolve(options.cwd, input);
		let stat: Awaited<ReturnType<typeof lstat>>;
		try {
			stat = await lstat(absolutePath);
		} catch {
			if (strict) throw new Error(`Input not found: ${absolutePath}`);
			continue;
		}

		if (stat.isDirectory()) {
			if (!options.includeHidden && isHiddenPath(input)) continue;
			await scanDirectory(
				absolutePath,
				{ recursive: options.recursive, includeHidden: options.includeHidden },
				discovered,
			);
			continue;
		}

		if (stat.isFile() || stat.isSymbolicLink()) {
			if (isMarkdownPath(absolutePath)) discovered.add(absolutePath);
		}
	}

	const filtered = await filterGitIgnored(Array.from(discovered), options.cwd);
	return uniqueInOrder(filtered);
}
