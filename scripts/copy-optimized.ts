#!/usr/bin/env bun
import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const targets = new Set([
	"darwin-arm64",
	"darwin-x64",
	"linux-arm64",
	"linux-x64",
]);

async function copyOptimizedBinary() {
	const target = `${process.platform}-${process.arch}`;
	if (!targets.has(target)) {
		console.error(`Unsupported platform: ${target}`);
		process.exit(1);
	}

	const archiveName = `lmv-${target}.tar.gz`;
	const archivePath = resolve("dist", archiveName);
	if (!(await Bun.file(archivePath).exists())) {
		console.error(`Archive not found: ${archivePath}`);
		console.error("Run `bun run build:all` first.");
		process.exit(1);
	}

	const temporaryDirectory = await mkdtemp(join(tmpdir(), "lmv-install-"));
	try {
		const result = Bun.spawnSync(
			["tar", "-xzf", archivePath, "-C", temporaryDirectory],
			{ stderr: "pipe" },
		);
		if (result.exitCode !== 0) {
			console.error(
				result.stderr.toString().trim() || "Failed to extract archive",
			);
			process.exit(1);
		}

		const sourcePath = join(temporaryDirectory, `lmv-${target}`);
		const installDirectory = join(homedir(), ".local", "bin");
		const destinationPath = join(installDirectory, "lmv");

		await mkdir(installDirectory, { recursive: true });
		await cp(sourcePath, destinationPath);
		await chmod(destinationPath, 0o755);
		console.log(`Installed ${destinationPath}`);
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

copyOptimizedBinary().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : "Installation failed");
	process.exit(1);
});
