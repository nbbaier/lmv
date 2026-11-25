import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "..");
const CLI_ENTRY = resolve(REPOSITORY_ROOT, "src/cli.ts");
const decoder = new TextDecoder();

function runCli(args: readonly string[], cwd = REPOSITORY_ROOT) {
	const result = Bun.spawnSync({
		cmd: [process.execPath, "run", CLI_ENTRY, "--", ...args],
		cwd,
		env: { ...process.env, NO_COLOR: "1" },
	});
	return {
		exitCode: result.exitCode,
		stdout: decoder.decode(result.stdout),
		stderr: decoder.decode(result.stderr),
	};
}

function reservePort(): number {
	const server = Bun.serve({ port: 0, fetch: () => new Response() });
	const port = server.port;
	server.stop(true);
	if (port === undefined) {
		throw new Error("Failed to reserve an available port");
	}
	return port;
}

async function waitForFileList(
	child: Bun.Subprocess,
	url: string,
): Promise<string[]> {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`CLI exited early with code ${child.exitCode}`);
		}
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(500) });
			if (response.ok) {
				const body: unknown = await response.json();
				if (
					typeof body === "object" &&
					body !== null &&
					"files" in body &&
					Array.isArray(body.files)
				) {
					return body.files
						.map((file) =>
							typeof file === "object" &&
							file !== null &&
							"path" in file &&
							typeof file.path === "string"
								? file.path
								: null,
						)
						.filter((path): path is string => path !== null);
				}
			}
		} catch {
			await Bun.sleep(50);
		}
	}
	throw new Error(`Timed out waiting for ${url}`);
}

describe("CLI process behavior", () => {
	const helpCases = [
		{ name: "short help", args: ["-h"] },
		{ name: "long help", args: ["--help"] },
		{ name: "help wins over invalid arguments", args: ["--unknown", "--help"] },
	] as const;

	for (const { name, args } of helpCases) {
		test(`${name} prints rich help and exits zero`, () => {
			const result = runCli(args);
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain("Usage:");
			expect(result.stdout).toContain("Options:");
			expect(result.stdout).toContain("Examples:");
		});
	}

	test("no arguments runs discovery on the current directory", async () => {
		const emptyDir = await mkdtemp(join(tmpdir(), "lmv-cli-empty-"));
		try {
			const bare = runCli([], emptyDir);
			const explicitDot = runCli(["."], emptyDir);
			expect(bare).toEqual(explicitDot);
			expect(bare.exitCode).toBe(1);
			expect(bare.stdout).toBe("");
			expect(bare.stderr).toContain("Error: No markdown files found");
		} finally {
			await rm(emptyDir, { recursive: true, force: true });
		}
	});

	test("omitting inputs serves markdown files from the current directory", async () => {
		const workdir = await mkdtemp(join(tmpdir(), "lmv-cli-cwd-"));
		let child: Bun.Subprocess | undefined;
		try {
			await Bun.write(join(workdir, "notes.md"), "# Notes\n");
			const port = reservePort();
			child = Bun.spawn({
				cmd: [
					process.execPath,
					"run",
					CLI_ENTRY,
					"--",
					"--no-open",
					"--port",
					String(port),
				],
				cwd: workdir,
				env: { ...process.env, NO_COLOR: "1" },
				stdout: "pipe",
				stderr: "pipe",
			});

			const files = await waitForFileList(
				child,
				`http://localhost:${port}/api/files`,
			);
			expect(files).toEqual(["notes.md"]);
		} finally {
			if (child) {
				child.kill();
				await child.exited;
			}
			await rm(workdir, { recursive: true, force: true });
		}
	});

	const helpSpellingPathCases = [
		{ name: "short help spelling", args: ["--", "-h"] },
		{ name: "long help spelling", args: ["--", "--help"] },
	] as const;

	for (const { name, args } of helpSpellingPathCases) {
		test(`${name} after -- is treated as an input`, () => {
			const result = runCli(args);
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain("Error: Input not found:");
			expect(result.stderr).not.toContain("Usage:");
		});
	}

	const errorCases = [
		{
			name: "unknown option",
			args: ["README.md", "--unknown"],
			message: "Error: Unknown option '--unknown'",
		},
		{
			name: "missing port value",
			args: ["README.md", "--port"],
			message: "Error: --port requires a number",
		},
		{
			name: "partial numeric port",
			args: ["README.md", "--port=8080abc"],
			message: "Error: Invalid port",
		},
		{
			name: "fractional port",
			args: ["README.md", "--port=80.5"],
			message: "Error: Invalid port",
		},
		{
			name: "nonnumeric port",
			args: ["README.md", "--port=http"],
			message: "Error: Invalid port",
		},
		{
			name: "port below range",
			args: ["README.md", "--port=0"],
			message: "Error: Invalid port",
		},
		{
			name: "port above range",
			args: ["README.md", "--port=65536"],
			message: "Error: Invalid port",
		},
	] as const;

	for (const { name, args, message } of errorCases) {
		test(`${name} prints guidance without a stack and exits one`, () => {
			const result = runCli(args);
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(message);
			expect(result.stderr).toContain("Run 'lmv --help' for usage.");
			expect(result.stderr).not.toContain("    at ");
		});
	}
});
