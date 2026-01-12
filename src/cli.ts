#!/usr/bin/env bun
import { resolve } from "path";
import { startServer } from "./server";

const args = process.argv.slice(2);

const DEFAULT_PORT = 3000;

function printHelp() {
  console.log(`
lmv - Local Markdown Viewer

Usage:
  lmv <file.md>           Open markdown file in browser
  lmv <file.md> -p 8080   Use custom port

Options:
  -p, --port <number>     Port to run server on (default: ${DEFAULT_PORT})
  -h, --help              Show this help message
  --no-open               Don't auto-open browser

Environment:
  GITHUB_TOKEN            Enable "Share as Gist" feature

Examples:
  lmv README.md
  lmv docs/guide.md -p 8080
  GITHUB_TOKEN=ghp_xxx lmv README.md
`);
}

async function isServerRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function openBrowser(url: string) {
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  Bun.spawn([opener, url], { stdio: ["ignore", "ignore", "ignore"] });
}

async function main() {
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  // Parse arguments
  let filePath: string | undefined;
  let port = DEFAULT_PORT;
  let autoOpen = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--port") {
      const portArg = args[++i];
      if (!portArg) {
        console.error("Error: --port requires a number");
        process.exit(1);
      }
      port = parseInt(portArg, 10);
      if (isNaN(port)) {
        console.error("Error: Invalid port number");
        process.exit(1);
      }
    } else if (arg === "--no-open") {
      autoOpen = false;
    } else if (arg && !arg.startsWith("-")) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error("Error: No file specified");
    printHelp();
    process.exit(1);
  }

  // Resolve and validate file
  const absolutePath = resolve(filePath);
  const file = Bun.file(absolutePath);
  const exists = await file.exists();

  if (!exists) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  const fileUrl = `http://localhost:${port}?file=${encodeURIComponent(absolutePath)}`;
  const serverRunning = await isServerRunning(port);

  if (serverRunning) {
    console.log(`
  Viewing: ${absolutePath}
  Server:  http://localhost:${port} (already running)
`);

    if (autoOpen) {
      openBrowser(fileUrl);
    }
    return;
  }

  // Start server
  const server = startServer(port);
  console.log(`
  Viewing: ${absolutePath}
  Server:  http://localhost:${server.port}

  Press Ctrl+C to stop
`);

  // Open browser
  if (autoOpen) {
    openBrowser(fileUrl);
  }
}

main();
