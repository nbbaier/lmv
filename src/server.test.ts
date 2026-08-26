import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server";

type FilesResponse = {
	singleFile: boolean;
	files: Array<{
		path: string;
		mtimeMs?: number;
		isSymlink?: boolean;
		error?: string;
	}>;
};

function isFilesResponse(value: unknown): value is FilesResponse {
	if (!value || typeof value !== "object") return false;
	return "singleFile" in value && "files" in value && Array.isArray(value.files);
}

describe("file API", () => {
	let server: ReturnType<typeof startServer> | undefined;
	let directory: string | undefined;

	afterEach(async () => {
		server?.stop(true);
		if (directory) await rm(directory, { recursive: true, force: true });
		server = undefined;
		directory = undefined;
	});

	test("refresh replaces discovered files and removes deleted paths from the allowlist", async () => {
		directory = await mkdtemp(join(tmpdir(), "lmv-server-"));
		const deletedPath = join(directory, "deleted.md");
		const retainedPath = join(directory, "retained.md");
		await Promise.all([
			writeFile(deletedPath, "deleted"),
			writeFile(retainedPath, "retained"),
		]);

		server = startServer(
			{
				cwd: directory,
				files: [deletedPath, retainedPath],
				inputs: ["."],
				recursive: false,
				includeHidden: false,
				includeIgnored: false,
			},
			0,
		);

		await unlink(deletedPath);
		await writeFile(join(directory, "added.md"), "added");

		const response = await fetch(
			`http://localhost:${server.port}/api/files?refresh=1`,
		);
		const body: unknown = await response.json();
		expect(isFilesResponse(body)).toBe(true);
		if (!isFilesResponse(body)) return;
		expect(body.files.map((file) => file.path).sort()).toEqual([
			"added.md",
			"retained.md",
		]);
		expect(body.singleFile).toBe(false);

		const deletedFileResponse = await fetch(
			`http://localhost:${server.port}/api/file?path=deleted.md`,
		);
		expect(deletedFileResponse.status).toBe(403);
	});

	test("reports ordinary and symlink metadata while retaining per-file errors", async () => {
		directory = await mkdtemp(join(tmpdir(), "lmv-server-"));
		const ordinaryPath = join(directory, "ordinary.md");
		const targetPath = join(directory, "target.md");
		const linkPath = join(directory, "link.md");
		const brokenPath = join(directory, "broken.md");
		await Promise.all([
			writeFile(ordinaryPath, "ordinary"),
			writeFile(targetPath, "target"),
		]);
		const targetMtime = new Date("2020-01-02T03:04:05Z");
		await utimes(targetPath, targetMtime, targetMtime);
		await Promise.all([
			symlink(targetPath, linkPath),
			symlink(join(directory, "missing.md"), brokenPath),
		]);

		server = startServer(
			{
				cwd: directory,
				files: [ordinaryPath, linkPath, brokenPath],
				inputs: ["ordinary.md", "link.md", "broken.md"],
				recursive: false,
				includeHidden: false,
				includeIgnored: false,
			},
			0,
		);

		const response = await fetch(`http://localhost:${server.port}/api/files`);
		const body: unknown = await response.json();
		expect(isFilesResponse(body)).toBe(true);
		if (!isFilesResponse(body)) return;

		const ordinary = body.files.find((file) => file.path === "ordinary.md");
		const link = body.files.find((file) => file.path === "link.md");
		const broken = body.files.find((file) => file.path === "broken.md");
		expect(ordinary?.isSymlink).toBe(false);
		expect(ordinary?.mtimeMs).toBeNumber();
		expect(link?.isSymlink).toBe(true);
		expect(link?.mtimeMs).toBe(targetMtime.getTime());
		expect(broken?.error).toBeString();
	});
});
