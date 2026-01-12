import { resolve, basename, extname } from "path";
import index from "./index.html";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

interface GistResponse {
  html_url: string;
  id: string;
}

type FileValidation = { path: string; filename: string } | { error: string };

function validateFilePath(filePath: string | null): FileValidation {
  if (!filePath) {
    return { error: "No file specified" };
  }

  const absolutePath = resolve(filePath);
  const ext = extname(absolutePath).toLowerCase();

  if (ext !== ".md" && ext !== ".markdown") {
    return { error: "Only .md and .markdown files are supported" };
  }

  return { path: absolutePath, filename: basename(absolutePath) };
}

function getFileParam(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("file");
}

export function startServer(port: number = 3000) {
  const server = Bun.serve({
    port,
    routes: {
      "/": index,
      "/health": {
        GET: () => Response.json({ ok: true }),
      },
      "/api/file": {
        GET: async (req) => {
          const validation = validateFilePath(getFileParam(req));
          if ("error" in validation) {
            return Response.json({ error: validation.error }, { status: 400 });
          }

          try {
            const file = Bun.file(validation.path);
            const exists = await file.exists();
            if (!exists) {
              return Response.json(
                { error: "File not found" },
                { status: 404 }
              );
            }
            const content = await file.text();
            return Response.json({ content, filename: validation.filename });
          } catch (error) {
            return Response.json(
              { error: "Failed to read file" },
              { status: 500 }
            );
          }
        },
        PUT: async (req) => {
          const validation = validateFilePath(getFileParam(req));
          if ("error" in validation) {
            return Response.json({ error: validation.error }, { status: 400 });
          }

          try {
            const body = (await req.json()) as { content?: unknown };
            const content = body.content;
            if (typeof content !== "string") {
              return Response.json(
                { error: "Invalid content" },
                { status: 400 }
              );
            }
            await Bun.write(validation.path, content);
            return Response.json({ success: true });
          } catch (error) {
            return Response.json(
              { error: "Failed to write file" },
              { status: 500 }
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
              { error: "GITHUB_TOKEN not configured. Set it in your environment to enable sharing." },
              { status: 400 }
            );
          }

          try {
            const body = (await req.json()) as {
              content?: unknown;
              filename?: unknown;
              public?: unknown;
            };
            const content = body.content;
            const name = body.filename;
            const isPublic = body.public !== false;

            if (typeof content !== "string" || !content.trim()) {
              return Response.json(
                { error: "Content is required" },
                { status: 400 }
              );
            }

            if (typeof name !== "string" || !name.trim()) {
              return Response.json(
                { error: "Filename is required" },
                { status: 400 }
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
                { status: response.status }
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
              { status: 500 }
            );
          }
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
