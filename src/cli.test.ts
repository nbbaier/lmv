import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "..");
const decoder = new TextDecoder();

function runCli(args: readonly string[]) {
	const result = Bun.spawnSync({
		cmd: [process.execPath, "run", "src/cli.ts", "--", ...args],
		cwd: REPOSITORY_ROOT,
		env: { ...process.env, NO_COLOR: "1" },
	});
	return {
		exitCode: result.exitCode,
		stdout: decoder.decode(result.stdout),
		stderr: decoder.decode(result.stderr),
	};
}

describe("CLI process behavior", () => {
	const helpCases = [
		{ name: "no arguments", args: [] },
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
			expect(result.stdout).toContain("Environment:");
			expect(result.stdout).toContain("Examples:");
		});
	}

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
