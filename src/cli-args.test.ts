import { describe, expect, test } from "bun:test";
import { parseCliArgs, type CliConfig } from "./cli-args";

const DEFAULT_CONFIG: Omit<CliConfig, "inputs"> = {
	port: 3000,
	autoOpen: true,
	recursive: false,
	includeHidden: false,
	includeIgnored: false,
};

describe("parseCliArgs", () => {
	const inputCases = [
		{
			name: "single file",
			args: ["README.md"],
			inputs: ["README.md"],
		},
		{
			name: "multiple files",
			args: ["README.md", "docs/guide.md"],
			inputs: ["README.md", "docs/guide.md"],
		},
		{
			name: "directory and glob",
			args: ["docs/", "docs/**/*.md"],
			inputs: ["docs/", "docs/**/*.md"],
		},
		{
			name: "dash-leading path after option terminator",
			args: ["--", "-notes.md"],
			inputs: ["-notes.md"],
		},
		{
			name: "short help spelling after option terminator",
			args: ["--", "-h"],
			inputs: ["-h"],
		},
		{
			name: "long help spelling after option terminator",
			args: ["--", "--help"],
			inputs: ["--help"],
		},
	] as const;

	for (const { name, args, inputs } of inputCases) {
		test(`preserves ${name} inputs`, () => {
			expect(parseCliArgs(args)).toEqual({
				inputs: [...inputs],
				...DEFAULT_CONFIG,
			});
		});
	}

	test("maps all functional options to the domain configuration", () => {
		expect(
			parseCliArgs([
				"docs/",
				"-r",
				"--no-open",
				"--hidden",
				"--ignored",
			]),
		).toEqual({
			inputs: ["docs/"],
			port: 3000,
			autoOpen: false,
			recursive: true,
			includeHidden: true,
			includeIgnored: true,
		});
	});

	const portCases = [
		{
			name: "long option with separate value",
			args: ["--port", "8080"],
			port: 8080,
		},
		{
			name: "long option with inline value",
			args: ["--port=8080"],
			port: 8080,
		},
		{ name: "short option", args: ["-p", "8080"], port: 8080 },
		{ name: "minimum port", args: ["--port", "1"], port: 1 },
		{ name: "maximum port", args: ["--port=65535"], port: 65535 },
	] as const;

	for (const { name, args, port } of portCases) {
		test(`accepts ${name}`, () => {
			expect(parseCliArgs(["README.md", ...args]).port).toBe(port);
		});
	}

	test("accepts the long recursive option", () => {
		expect(parseCliArgs(["docs/", "--recursive"]).recursive).toBe(true);
	});

	const invalidCases = [
		{
			name: "missing port value",
			args: ["README.md", "--port"],
			message: "--port requires a number",
		},
		{
			name: "partial numeric port",
			args: ["README.md", "--port", "8080abc"],
			message: "Invalid port",
		},
		{
			name: "fractional port",
			args: ["README.md", "--port", "80.5"],
			message: "Invalid port",
		},
		{
			name: "nonnumeric port",
			args: ["README.md", "--port", "http"],
			message: "Invalid port",
		},
		{
			name: "zero port",
			args: ["README.md", "--port", "0"],
			message: "Invalid port",
		},
		{
			name: "negative port",
			args: ["README.md", "--port=-1"],
			message: "Invalid port",
		},
		{
			name: "port above 65535",
			args: ["README.md", "--port=65536"],
			message: "Invalid port",
		},
		{
			name: "unknown option",
			args: ["README.md", "--unknown"],
			message: "Unknown option '--unknown'",
		},
		{
			name: "options without inputs",
			args: ["--recursive"],
			message: "No inputs specified",
		},
	] as const;

	for (const { name, args, message } of invalidCases) {
		test(`rejects ${name}`, () => {
			expect(() => parseCliArgs(args)).toThrow(message);
		});
	}
});
