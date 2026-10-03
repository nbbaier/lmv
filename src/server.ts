import { watch } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { createServer, ServerResponse, type IncomingMessage } from "node:http";
import { basename, dirname, relative, resolve } from "node:path";
import { FRONTEND_HTML } from "./frontend.generated";
import { discoverMarkdownFiles } from "./lib/file-discovery";
import { getLastDocument, setLastDocument } from "./lib/state";

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
	includeIgnored: boolean;
};

type ApiFile = {
	path: string; // posix-ish, relative to config.cwd
	name: string;
	mtimeMs?: number;
	isSymlink?: boolean;
	error?: string;
};

const FILE_METADATA_CONCURRENCY = 16;

function toPosixPath(p: string) {
	return p.replaceAll("\\", "/");
}

function buildAllowedFiles(cwd: string, files: readonly string[]) {
	const allowed = new Map<string, string>();
	for (const abs of files) {
		const rel = toPosixPath(relative(cwd, abs));
		if (!allowed.has(rel)) allowed.set(rel, abs);
	}
	return allowed;
}

async function collectApiFiles(allowedFiles: Map<string, string>) {
	const entries = [...allowedFiles.entries()];
	const files = new Array<ApiFile>(entries.length);
	let nextIndex = 0;

	const workers = Array.from(
		{ length: Math.min(FILE_METADATA_CONCURRENCY, entries.length) },
		async () => {
			while (nextIndex < entries.length) {
				const index = nextIndex++;
				const entry = entries[index];
				if (!entry) return;
				const [relPath, absPath] = entry;
				const name = basename(absPath);

				try {
					const lst = await lstat(absPath);
					const isSymlink = lst.isSymbolicLink();
					const metadata = isSymlink ? await stat(absPath) : lst;
					files[index] = {
						path: relPath,
						name,
						mtimeMs: metadata.mtimeMs,
						isSymlink,
					};
				} catch (error) {
					files[index] = {
						path: relPath,
						name,
						error:
							error instanceof Error ? error.message : "Failed to stat file",
					};
				}
			}
		},
	);

	await Promise.all(workers);
	return files;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(payload),
	});
	res.end(payload);
}

function sendError(res: ServerResponse, status: number, message: string) {
	sendJson(res, status, { error: message });
}

function readRequestJson(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolvePromise, rejectPromise) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			try {
				if (chunks.length === 0) return resolvePromise({});
				resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch (error) {
				rejectPromise(error);
			}
		});
		req.on("error", (error) => rejectPromise(error));
	});
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) return null;
	return value as Record<string, unknown>;
}

export function startServer(config: StartServerConfig, port: number = 3000) {
	let allowedFiles = buildAllowedFiles(config.cwd, config.files);
	let singleFile = allowedFiles.size === 1;
	let pendingRefresh = false;

	// unknown[] instead of a typed collection: scriptc does not support
	// server handles as typed array elements, Set elements, or Map keys,
	// but checked `unknown` storage retains object references.
	let sseClients: unknown[] = [];

	const removeSseClient = (client: unknown) => {
		sseClients = sseClients.filter((c) => c !== client);
	};

	const broadcast = (event: string, data: unknown) => {
		const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
		for (const client of sseClients) {
			// scriptc has no instanceof for node:http classes; this conversion
			// is runtime-checked by scriptc, so a bad entry throws here.
			// biome-ignore lint/style/useConsistentTypeAssertions: runtime-checked narrowing required for scriptc
			const response = client as ServerResponse;
			try {
				response.write(payload);
			} catch {
				removeSseClient(client);
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
				includeIgnored: config.includeIgnored,
				strict: false,
			});
			allowedFiles = buildAllowedFiles(config.cwd, discovered);
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

		// scriptc: fs.watch has no recursive-option lowering — enumerate
		// subdirectories ourselves and watch each one.
		const watchTargets = new Set<string>();
		for (const [absRoot, recursive] of watchRoots.entries()) {
			watchTargets.add(absRoot);
			if (!recursive) continue;
			const pending = [absRoot];
			while (pending.length > 0) {
				const dir = pending.pop();
				if (!dir) break;
				let names;
				try {
					names = await readdir(dir);
				} catch {
					continue;
				}
				for (const name of names) {
					if (!config.includeHidden && name.startsWith(".")) continue;
					const sub = resolve(dir, name);
					try {
						const lst = await lstat(sub);
						if (!lst.isDirectory()) continue;
					} catch {
						continue;
					}
					if (!watchTargets.has(sub)) {
						watchTargets.add(sub);
						pending.push(sub);
					}
				}
			}
		}

		for (const watchDir of watchTargets) {
			try {
				const w = watch(watchDir, (_event: string) => {
					// scriptc's fs.watch lowering does not provide the filename,
					// so any change flags a pending refresh.
					maybeSetPendingRefresh();
				});
				void w;
			} catch {
				// ignore watch errors
			}
		}
	};

	void setupWatchers();

	const handleApiFiles = async (req: IncomingMessage, res: ServerResponse) => {
		if (req.method !== "GET") return sendError(res, 405, "Method not allowed");
		const url = new URL(req.url ?? "/", "http://localhost");
		const shouldRefresh =
			url.searchParams.get("refresh") === "true" ||
			url.searchParams.get("refresh") === "1";

		if (shouldRefresh) {
			const ok = await rescan();
			if (ok) broadcast("fs-changed", { pendingRefresh: false });
		}

		const files = await collectApiFiles(allowedFiles);
		sendJson(res, 200, {
			cwd: config.cwd,
			singleFile,
			pendingRefresh,
			files,
		});
	};

	const handleApiFile = async (req: IncomingMessage, res: ServerResponse) => {
		// Read-only API: non-GET requests are rejected as if no route exists.
		if (req.method !== "GET") return sendError(res, 404, "Not found");
		const url = new URL(req.url ?? "/", "http://localhost");
		const requestedPath = url.searchParams.get("path") || undefined;

		const relPath =
			requestedPath ??
			(singleFile ? [...allowedFiles.keys()][0] : undefined);
		if (!relPath) {
			return sendError(res, 400, "Missing required query param: path");
		}

		const absPath = allowedFiles.get(relPath);
		if (!absPath) {
			return sendError(res, 403, "File not allowed");
		}

		try {
			const lst = await lstat(absPath).catch(() => null);
			if (!lst) {
				return sendError(res, 404, "File not found");
			}
			const content = await readFile(absPath, "utf8");
			sendJson(res, 200, {
				content,
				filename: basename(absPath),
				path: relPath,
			});
		} catch {
			sendError(res, 500, "Failed to read file");
		}
	};

	const handleApiShare = async (req: IncomingMessage, res: ServerResponse) => {
		if (req.method === "GET") {
			return sendJson(res, 200, { configured: Boolean(GITHUB_TOKEN) });
		}
		if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

		if (!GITHUB_TOKEN) {
			return sendError(
				res,
				400,
				"GITHUB_TOKEN not configured. Set it in your environment to enable sharing.",
			);
		}

		try {
			const body = asRecord(await readRequestJson(req));
			const content = body?.content;
			const name = body?.filename;
			const isPublic = body?.public !== false;

			if (typeof content !== "string" || !content.trim()) {
				return sendError(res, 400, "Content is required");
			}
			if (typeof name !== "string" || !name) {
				return sendError(res, 400, "Filename is required");
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
				return sendJson(res, response.status, {
					error: "Failed to create gist",
				});
			}

			const gist = asRecord(await response.json());
			if (
				!gist ||
				typeof gist.html_url !== "string" ||
				typeof gist.id !== "string"
			) {
				return sendError(res, 502, "Unexpected response from GitHub");
			}
			const result: GistResponse = { html_url: gist.html_url, id: gist.id };
			sendJson(res, 200, { url: result.html_url, id: result.id });
		} catch (error) {
			console.error("Share error:", error);
			sendError(res, 500, "Failed to create gist");
		}
	};

	const handleApiLastDocument = async (
		req: IncomingMessage,
		res: ServerResponse,
	) => {
		if (req.method === "GET") {
			const path = await getLastDocument(config.cwd);
			if (path && allowedFiles.has(path)) {
				return sendJson(res, 200, { path });
			}
			return sendJson(res, 200, { path: null });
		}
		if (req.method !== "PUT") return sendError(res, 405, "Method not allowed");

		try {
			const body = asRecord(await readRequestJson(req));
			const path = body?.path;
			if (typeof path !== "string" || !allowedFiles.has(path)) {
				return sendError(res, 400, "Invalid path");
			}
			await setLastDocument(config.cwd, path);
			sendJson(res, 200, { success: true });
		} catch {
			sendError(res, 500, "Failed to save last document");
		}
	};

	const handleApiWatch = (req: IncomingMessage, res: ServerResponse) => {
		if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		res.write(`event: ready\ndata: {}\n\n`);
		if (pendingRefresh) {
			res.write(
				`event: fs-changed\ndata: ${JSON.stringify({ pendingRefresh: true })}\n\n`,
			);
		}

		sseClients.push(res);
		const interval = setInterval(() => {
			try {
				res.write(`: ping\n\n`);
			} catch {
				clearInterval(interval);
				removeSseClient(res);
			}
		}, 15000);

		req.on("close", () => {
			clearInterval(interval);
			removeSseClient(res);
		});
	};

	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const pathname = url.pathname;

		const fail = (message: string) => {
			console.error("Request error:", message);
			if (!res.headersSent) sendError(res, 500, "Internal server error");
			else res.end();
		};
		if (pathname === "/api/files") {
			handleApiFiles(req, res).catch((error) =>
				fail(error instanceof Error ? error.message : String(error)),
			);
			return;
		}
		if (pathname === "/api/file") {
			handleApiFile(req, res).catch((error) =>
				fail(error instanceof Error ? error.message : String(error)),
			);
			return;
		}
		if (pathname === "/api/share") {
			handleApiShare(req, res).catch((error) =>
				fail(error instanceof Error ? error.message : String(error)),
			);
			return;
		}
		if (pathname === "/api/last-document") {
			handleApiLastDocument(req, res).catch((error) =>
				fail(error instanceof Error ? error.message : String(error)),
			);
			return;
		}
		if (pathname === "/api/watch") {
			try {
				handleApiWatch(req, res);
			} catch (error) {
				fail(error instanceof Error ? error.message : String(error));
			}
			return;
		}
		if (pathname === "/" && req.method === "GET") {
			res.writeHead(200, {
				"Content-Type": "text/html; charset=utf-8",
				"Content-Length": Buffer.byteLength(FRONTEND_HTML),
			});
			res.end(FRONTEND_HTML);
			return;
		}

		sendError(res, 404, "Not found");
	});

	// SSE connections must never time out.
	server.requestTimeout = 0;
	server.headersTimeout = 0;
	server.timeout = 0;

	server.listen(port);
	return server;
}
