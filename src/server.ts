import { watch } from "node:fs";
import { lstat, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import index from "./index.html";
import { discoverMarkdownFiles } from "./lib/file-discovery";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

interface GistResponse {
	html_url: string;
	id: string;
}

export type StartServerConfig = {
	cwd: string;
	files: string[]; // absolute paths
	inputs: string[];
	recursive: boolean;
	includeHidden: boolean;
};

type ApiFile = {
	path: string; // posix-ish, relative to config.cwd
	name: string;
	mtimeMs?: number;
	isSymlink?: boolean;
	error?: string;
};

function toPosixPath(p: string) {
	return p.replaceAll("\\", "/");
}

function buildAllowedFiles(cwd: string, files: Iterable<string>) {
	const allowed = new Map<string, string>();
	for (const abs of files) {
		const rel = toPosixPath(relative(cwd, abs));
		if (!allowed.has(rel)) allowed.set(rel, abs);
	}
	return allowed;
}

export function startServer(config: StartServerConfig, port: number = 3000) {
	const absoluteFiles = new Set<string>(config.files);
	let allowedFiles = buildAllowedFiles(config.cwd, absoluteFiles);
	let singleFile = allowedFiles.size === 1;
	let pendingRefresh = false;

	const encoder = new TextEncoder();
	const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

	const broadcast = (event: string, data: unknown) => {
		const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
		const chunk = encoder.encode(payload);
		for (const controller of sseClients) {
			try {
				controller.enqueue(chunk);
			} catch {
				sseClients.delete(controller);
			}
		}
	};

	const maybeSetPendingRefresh = () => {
		if (pendingRefresh) return;
		pendingRefresh = true;
		broadcast("fs-changed", { pendingRefresh: true });
	};

	const isHiddenPath = (p: string) =>
		toPosixPath(p)
			.split("/")
			.filter(Boolean)
			.some((seg) => seg.startsWith(".") && seg !== "." && seg !== "..");

	const isMarkdownPath = (p: string) => {
		const lower = p.toLowerCase();
		return lower.endsWith(".md") || lower.endsWith(".markdown");
	};

	const rescan = async () => {
		try {
			const discovered = await discoverMarkdownFiles(config.inputs, {
				cwd: config.cwd,
				recursive: config.recursive,
				includeHidden: config.includeHidden,
				strict: false,
			});
			for (const abs of discovered) absoluteFiles.add(abs);
			allowedFiles = buildAllowedFiles(config.cwd, absoluteFiles);
			singleFile = allowedFiles.size === 1;
			pendingRefresh = false;
			return true;
		} catch {
			return false;
		}
	};

	const setupWatchers = async () => {
		const watchRoots = new Map<string, boolean>();

		const addWatchRoot = (absRoot: string, recursive: boolean) => {
			const existing = watchRoots.get(absRoot);
			if (existing === true) return;
			if (existing === false && recursive === false) return;
			watchRoots.set(absRoot, recursive || (existing ?? false));
		};

		const isGlobPattern = (input: string) => /[*?[\]{}()!]/.test(input);
		const globBaseDir = (pattern: string) => {
			const idx = pattern.search(/[*?[\]{}()!]/);
			const prefix = idx === -1 ? pattern : pattern.slice(0, idx);
			const normalized = toPosixPath(prefix);
			const lastSlash = normalized.lastIndexOf("/");
			const base = lastSlash === -1 ? "." : normalized.slice(0, lastSlash);
			return base || ".";
		};

		for (const input of config.inputs) {
			if (isGlobPattern(input)) {
				const base = globBaseDir(input);
				addWatchRoot(resolve(config.cwd, base), input.includes("**"));
				continue;
			}

			const abs = resolve(config.cwd, input);
			try {
				const lst = await lstat(abs);
				if (lst.isDirectory()) {
					addWatchRoot(abs, Boolean(config.recursive));
				} else {
					addWatchRoot(dirname(abs), false);
				}
			} catch {
				// ignore missing inputs for watch purposes
			}
		}

		if (watchRoots.size === 0)
			addWatchRoot(config.cwd, Boolean(config.recursive));

		for (const [absRoot, recursive] of watchRoots.entries()) {
			try {
				const w = watch(
					absRoot,
					{ recursive },
					(_event, filename: string | Buffer | null) => {
						const name = filename
							? typeof filename === "string"
								? filename
								: filename.toString()
							: null;

						if (!name) return void maybeSetPendingRefresh();
						if (!config.includeHidden && isHiddenPath(name)) return;

						const absPath = resolve(absRoot, name);
						const relPath = toPosixPath(relative(config.cwd, absPath));

						if (allowedFiles.has(relPath)) {
							broadcast("file-changed", { path: relPath });
							return;
						}

						if (isMarkdownPath(absPath)) maybeSetPendingRefresh();
					},
				);

				w.on("error", () => {});
			} catch {
				// ignore watch errors (e.g. unsupported recursive mode)
			}
		}
	};

	void setupWatchers();

	const server = Bun.serve({
		idleTimeout: 0,
		port,
		routes: {
			"/": index,
			"/api/files": {
				GET: async (req) => {
					const url = new URL(req.url);
					const shouldRefresh =
						url.searchParams.get("refresh") === "true" ||
						url.searchParams.get("refresh") === "1";

					if (shouldRefresh) {
						const ok = await rescan();
						if (ok) broadcast("fs-changed", { pendingRefresh: false });
					}

					const files: ApiFile[] = [];
					for (const [relPath, absPath] of allowedFiles.entries()) {
						const name = basename(absPath);
						try {
							const lst = await lstat(absPath);
							const st = await stat(absPath);
							files.push({
								path: relPath,
								name,
								mtimeMs: st.mtimeMs,
								isSymlink: lst.isSymbolicLink(),
							});
						} catch (error) {
							files.push({
								path: relPath,
								name,
								error: (error as Error).message || "Failed to stat file",
							});
						}
					}
					return Response.json({
						cwd: config.cwd,
						singleFile,
						pendingRefresh,
						files,
					});
				},
			},
			"/api/file": {
				GET: async (req) => {
					const url = new URL(req.url);
					const requestedPath = url.searchParams.get("path") || undefined;

					const relPath =
						requestedPath ??
						(singleFile ? [...allowedFiles.keys()][0] : undefined);
					if (!relPath) {
						return Response.json(
							{ error: "Missing required query param: path" },
							{ status: 400 },
						);
					}

					const absPath = allowedFiles.get(relPath);
					if (!absPath) {
						return Response.json(
							{ error: "File not allowed" },
							{ status: 403 },
						);
					}

					try {
						const file = Bun.file(absPath);
						const exists = await file.exists();
						if (!exists) {
							return Response.json(
								{ error: "File not found" },
								{ status: 404 },
							);
						}
						const content = await file.text();
						return Response.json({
							content,
							filename: basename(absPath),
							path: relPath,
						});
					} catch (_error) {
						return Response.json(
							{ error: "Failed to read file" },
							{ status: 500 },
						);
					}
				},
				PUT: async (req) => {
					const url = new URL(req.url);
					const requestedPath = url.searchParams.get("path") || undefined;

					const relPath =
						requestedPath ??
						(singleFile ? [...allowedFiles.keys()][0] : undefined);
					if (!relPath) {
						return Response.json(
							{ error: "Missing required query param: path" },
							{ status: 400 },
						);
					}

					const absPath = allowedFiles.get(relPath);
					if (!absPath) {
						return Response.json(
							{ error: "File not allowed" },
							{ status: 403 },
						);
					}

					try {
						const body = await req.json();
						const content = body.content;
						if (typeof content !== "string") {
							return Response.json(
								{ error: "Invalid content" },
								{ status: 400 },
							);
						}
						await Bun.write(absPath, content);
						return Response.json({ success: true });
					} catch (_error) {
						return Response.json(
							{ error: "Failed to write file" },
							{ status: 500 },
						);
					}
				},
			},
			"/api/share": {
				GET: () => {
					return Response.json({ configured: Boolean(GITHUB_TOKEN) });
				},
				POST: async (req) => {
					if (!GITHUB_TOKEN) {
						return Response.json(
							{
								error:
									"GITHUB_TOKEN not configured. Set it in your environment to enable sharing.",
							},
							{ status: 400 },
						);
					}

					try {
						const body = await req.json();
						const content = body.content as string;
						const name = body.filename as string;
						const isPublic = body.public !== false;

						if (typeof content !== "string" || !content.trim()) {
							return Response.json(
								{ error: "Content is required" },
								{ status: 400 },
							);
						}

						const response = await fetch("https://api.github.com/gists", {
							method: "POST",
							headers: {
								Authorization: `Bearer ${GITHUB_TOKEN}`,
								Accept: "application/vnd.github+json",
								"X-GitHub-Api-Version": "2022-11-28",
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								description: `Shared via lmv: ${name}`,
								public: isPublic,
								files: {
									[name]: { content },
								},
							}),
						});

						if (!response.ok) {
							const error = await response.text();
							console.error("GitHub API error:", error);
							return Response.json(
								{ error: "Failed to create gist" },
								{ status: response.status },
							);
						}

						const gist = (await response.json()) as GistResponse;
						return Response.json({
							url: gist.html_url,
							id: gist.id,
						});
					} catch (error) {
						console.error("Share error:", error);
						return Response.json(
							{ error: "Failed to create gist" },
							{ status: 500 },
						);
					}
				},
			},
			"/api/watch": {
				GET: () => {
					let controllerRef: ReadableStreamDefaultController<Uint8Array> | null =
						null;
					let interval: ReturnType<typeof setInterval> | null = null;

					const stream = new ReadableStream<Uint8Array>({
						start(controller) {
							controllerRef = controller;
							sseClients.add(controller);
							controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`));
							if (pendingRefresh) {
								controller.enqueue(
									encoder.encode(
										`event: fs-changed\ndata: ${JSON.stringify({ pendingRefresh: true })}\n\n`,
									),
								);
							}
							interval = setInterval(() => {
								try {
									controller.enqueue(encoder.encode(`: ping\n\n`));
								} catch {
									if (interval) clearInterval(interval);
									sseClients.delete(controller);
								}
							}, 15000);
						},
						cancel(_reason) {
							if (controllerRef) sseClients.delete(controllerRef);
							if (interval) clearInterval(interval);
						},
					});

					return new Response(stream, {
						headers: {
							"Content-Type": "text/event-stream",
							"Cache-Control": "no-cache",
							Connection: "keep-alive",
						},
					});
				},
			},
		},
		development: {
			hmr: true,
			console: true,
		},
	});

	return server;
}
