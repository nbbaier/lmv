#!/usr/bin/env bun
import { parseCliArgs } from "./cli-args";
import { discoverMarkdownFiles } from "./lib/file-discovery";
import { startServer } from "./server";

function printHelp() {
	console.log(`
lmv - Local Markdown Viewer

Usage:
  lmv <file.md>                         Open a markdown file
  lmv <file1.md> <file2.md> ...         Open multiple markdown files
  lmv <dir>                             Discover .md files in a directory
  lmv 'docs/**/*.md'                    Open files via glob pattern
  lmv <file.md> -p 8080                 Use custom port

Options:
  -p, --port <number>     Port to run server on (default: 3000)
  -h, --help              Show this help message
  -r, --recursive         Recurse into directories (directory inputs only)
  --no-open               Don't auto-open browser
  --hidden                Include hidden files/folders (directory inputs only)
  --ignored               Include files ignored by git

Environment:
  GITHUB_TOKEN            Enable "Share as Gist" feature

Examples:
  lmv README.md
  lmv docs/guide.md -p 8080
  lmv docs/ --recursive
  lmv README.md docs/guide.md
  lmv 'docs/**/*.md'
  GITHUB_TOKEN=ghp_xxx lmv README.md
`);
}

async function main() {
	const rawArgs = process.argv.slice(2);
	if (rawArgs.length === 0) {
		printHelp();
		process.exit(0);
	}

	const terminatorIndex = rawArgs.indexOf("--");
	const flagArgs = terminatorIndex === -1 ? rawArgs : rawArgs.slice(0, terminatorIndex);
	if (flagArgs.includes("-h") || flagArgs.includes("--help")) {
		printHelp();
		process.exit(0);
	}

	let config: ReturnType<typeof parseCliArgs>;
	try {
		config = parseCliArgs(rawArgs);
	} catch (error) {
		console.error(
			`Error: ${error instanceof Error ? error.message : "Invalid arguments"}`,
		);
		console.error("\nRun 'lmv --help' for usage.");
		process.exit(1);
	}

	const {
		inputs,
		port,
		autoOpen,
		recursive,
		includeHidden,
		includeIgnored,
	} = config;

	let discovered: string[];
	try {
		discovered = await discoverMarkdownFiles(inputs, {
			cwd: process.cwd(),
			recursive,
			includeHidden,
			includeIgnored,
		});
	} catch (error) {
		console.error(
			`Error: ${(error as Error).message || "Failed to discover markdown files"}`,
		);
		process.exit(1);
	}

	if (discovered.length === 0) {
		console.error("Error: No markdown files found");
		process.exit(1);
	}

	// Start server
	const server = startServer(
		{
			cwd: process.cwd(),
			files: discovered,
			inputs,
			recursive,
			includeHidden,
			includeIgnored,
		},
		port,
	);
	const url = `http://localhost:${server.port}`;

	console.log(`
  Viewing: ${discovered.length} file${discovered.length === 1 ? "" : "s"}
  Server:  ${url}

  Press Ctrl+C to stop
`);

	// Open browser
	if (autoOpen) {
		const opener =
			process.platform === "darwin"
				? "open"
				: process.platform === "win32"
					? "start"
					: "xdg-open";

		Bun.spawn([opener, url], { stdio: ["ignore", "ignore", "ignore"] });
	}
}

if (import.meta.main) void main();
