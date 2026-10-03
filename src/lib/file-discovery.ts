import { spawnSync } from "node:child_process";
import { existsSync, type Stats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { delimiter, join, relative, resolve } from "node:path";

const REGEX_SPECIALS = /[.+^$()|\\]/g;

/** Convert a glob pattern to a RegExp matching posix-style relative paths. */
function globToRegExp(pattern: string): RegExp {
	const posix = toPosixPath(pattern);
	let out = "^";
	let i = 0;
	while (i < posix.length) {
		const char = posix[i];
		if (char === "*") {
			if (posix[i + 1] === "*") {
				// "**/" matches zero or more directories; "**" matches anything.
				if (posix[i + 2] === "/") {
					out += "(?:.*/)?";
					i += 3;
				} else {
					out += ".*";
					i += 2;
				}
			} else {
				out += "[^/]*";
				i += 1;
			}
			continue;
		}
		if (char === "?") {
			out += "[^/]";
			i += 1;
			continue;
		}
		if (char === "[") {
			const end = posix.indexOf("]", i + 1);
			if (end === -1) {
				out += "\\[";
				i += 1;
				continue;
			}
			let cls = posix.slice(i + 1, end);
			if (cls.startsWith("!")) cls = "^" + cls.slice(1);
			out += `[${cls}]`;
			i = end + 1;
			continue;
		}
		if (char === "{") {
			const end = posix.indexOf("}", i + 1);
			if (end === -1) {
				out += "\\{";
				i += 1;
				continue;
			}
			const alternatives = posix
				.slice(i + 1, end)
				.split(",")
				.map((alt) => alt.replace(REGEX_SPECIALS, "\\$&"));
			out += `(?:${alternatives.join("|")})`;
			i = end + 1;
			continue;
		}
		if (char && REGEX_SPECIALS.test(char)) {
			REGEX_SPECIALS.lastIndex = 0;
			out += `\\${char}`;
		} else if (char) {
			out += char;
		}
		i += 1;
	}
	out += "$";
	return new RegExp(out);
}

/** Static directory prefix of a glob pattern (before the first magic char). */
function globBaseDir(pattern: string): string {
	const posix = toPosixPath(pattern);
	const idx = posix.search(/[*?[\]{}()!]/);
	const prefix = idx === -1 ? posix : posix.slice(0, idx);
	const lastSlash = prefix.lastIndexOf("/");
	const base = lastSlash === -1 ? "." : prefix.slice(0, lastSlash);
	return base || ".";
}

/** Minimal glob scan replacement (Bun.Glob / fs.glob are unavailable here). */
async function globScan(pattern: string, cwd: string): Promise<string[]> {
	const regex = globToRegExp(pattern);
	const baseDir = resolve(cwd, globBaseDir(pattern));
	const matches: string[] = [];

	async function walk(dir: string): Promise<void> {
		let names;
		try {
			names = await readdir(dir);
		} catch {
			return;
		}
		for (const name of names) {
			// Mirror Bun.Glob: never descend into dot-directories.
			if (name.startsWith(".")) continue;
			const abs = join(dir, name);
			const rel = toPosixPath(relative(cwd, abs));
			if (regex.test(rel)) matches.push(rel);
			try {
				const lst = await lstat(abs);
				if (lst.isDirectory()) await walk(abs);
			} catch {
				// skip unreadable entries
			}
		}
	}

	await walk(baseDir);
	return matches;
}

function which(command: string): string | null {
	const pathEnv = process.env.PATH;
	if (!pathEnv) return null;
	const exts =
		process.platform === "win32"
			? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
			: [""];
	for (const dir of pathEnv.split(delimiter)) {
		if (!dir) continue;
		for (const ext of exts) {
			const candidate = join(dir, command + ext);
			if (existsSync(candidate)) return candidate;
		}
	}
	return null;
}

type DiscoverOptions = {
	cwd: string;
	recursive: boolean;
	includeHidden: boolean;
	includeIgnored: boolean;
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
	const names = await readdir(dir);

	for (const name of names) {
		if (!options.includeHidden && name.startsWith(".")) continue;
		const absolutePath = resolve(dir, name);

		let lst: Stats;
		try {
			lst = await lstat(absolutePath);
		} catch {
			continue;
		}

		if (lst.isDirectory()) {
			if (!options.recursive) continue;
			await scanDirectory(absolutePath, options, out);
			continue;
		}

		if (lst.isFile() || lst.isSymbolicLink()) {
			if (!isMarkdownPath(name)) continue;
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

async function filterGitIgnored(
	absolutePaths: string[],
	cwd: string,
	includeIgnored: boolean,
) {
	if (absolutePaths.length === 0) return absolutePaths;
	if (includeIgnored) return absolutePaths;
	if (!which("git")) return absolutePaths;

	const toplevel = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (toplevel.status !== 0) return absolutePaths;
	const repoRoot = toplevel.stdout.trim();
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

	// Pass candidates as pathspec args instead of --stdin: scriptc's
	// spawnSync lowering does not support the `input` option.
	const ignored = spawnSync(
		"git",
		["-C", repoRoot, "check-ignore", "-z", "--", ...relCandidates],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	if (ignored.status !== 0 && ignored.status !== 1) return absolutePaths;

	const ignoredRel = ignored.stdout.split("\0").filter(Boolean);
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
			const matches: string[] = [];
			for (const match of await globScan(input, options.cwd)) {
				matches.push(resolve(options.cwd, match));
			}
			for (const p of filterByMarkdown(filterByHidden(matches, options))) {
				discovered.add(p);
			}
			continue;
		}

		const absolutePath = resolve(options.cwd, input);
		let stat: Stats;
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

	const filtered = await filterGitIgnored(
		Array.from(discovered),
		options.cwd,
		options.includeIgnored,
	);
	return uniqueInOrder(filtered);
}
