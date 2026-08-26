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

	test("rejects PUT without modifying or recreating a single source file", async () => {
		directory = await mkdtemp(join(tmpdir(), "lmv-server-"));
		const sourcePath = join(directory, "single.md");
		const original = new TextEncoder().encode("# Original\r\n\r\nByte stable.\n");
		await Bun.write(sourcePath, original);

		server = startServer(
			{
				cwd: directory,
				files: [sourcePath],
				inputs: ["single.md"],
				recursive: false,
				includeHidden: false,
				includeIgnored: false,
			},
			0,
		);

		for (const query of ["", "?path=single.md"]) {
			const response = await fetch(
				`http://localhost:${server.port}/api/file${query}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ content: "replacement" }),
				},
			);
			expect(response.status).toBe(404);
			expect(await Bun.file(sourcePath).bytes()).toEqual(original);
		}

		await unlink(sourcePath);
		const recreateResponse = await fetch(
			`http://localhost:${server.port}/api/file`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "recreated" }),
			},
		);
		expect(recreateResponse.status).toBe(404);
		expect(await Bun.file(sourcePath).exists()).toBe(false);
	});

	test("rejects PUT for allowed and disallowed paths in multi-file mode", async () => {
		directory = await mkdtemp(join(tmpdir(), "lmv-server-"));
		const firstPath = join(directory, "first.md");
		const secondPath = join(directory, "second.md");
		const disallowedPath = join(directory, "disallowed.md");
		const firstOriginal = new TextEncoder().encode("first\r\n");
		const secondOriginal = new TextEncoder().encode("second\n");
		const disallowedOriginal = new TextEncoder().encode("outside allowlist\n");
		await Promise.all([
			Bun.write(firstPath, firstOriginal),
			Bun.write(secondPath, secondOriginal),
			Bun.write(disallowedPath, disallowedOriginal),
		]);

		server = startServer(
			{
				cwd: directory,
				files: [firstPath, secondPath],
				inputs: ["first.md", "second.md"],
				recursive: false,
				includeHidden: false,
				includeIgnored: false,
			},
			0,
		);

		for (const query of [
			"",
			"?path=first.md",
			"?path=disallowed.md",
			"?path=new.md",
		]) {
			const response = await fetch(
				`http://localhost:${server.port}/api/file${query}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ content: "replacement" }),
				},
			);
			expect(response.status).toBe(404);
		}

		expect(await Bun.file(firstPath).bytes()).toEqual(firstOriginal);
		expect(await Bun.file(secondPath).bytes()).toEqual(secondOriginal);
		expect(await Bun.file(disallowedPath).bytes()).toEqual(disallowedOriginal);
		expect(await Bun.file(join(directory, "new.md")).exists()).toBe(false);
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
