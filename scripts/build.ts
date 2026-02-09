#!/usr/bin/env bun

/**
 * Cross-platform build script for lmv
 * Creates standalone binaries for each target platform
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const VERSION = process.env.VERSION || "dev";
const DIST_DIR = "dist";

// Bun supported targets for cross-compilation
const TARGETS = [
	{ target: "bun-darwin-arm64", name: "lmv-darwin-arm64" },
	{ target: "bun-darwin-x64", name: "lmv-darwin-x64" },
	{ target: "bun-linux-arm64", name: "lmv-linux-arm64" },
	{ target: "bun-linux-x64", name: "lmv-linux-x64" },
] as const;

async function build() {
	console.log(`Building lmv v${VERSION}\n`);

	// Clean dist
	await rm(DIST_DIR, { recursive: true, force: true });
	await mkdir(DIST_DIR, { recursive: true });

	for (const { target, name } of TARGETS) {
		console.log(`Building ${name}...`);
		const outfile = join(DIST_DIR, name);

		try {
			await $`bun build src/cli.ts --compile --target=${target} --outfile=${outfile}`.quiet();
			console.log(`  ✓ ${outfile}`);
		} catch (error) {
			console.error(`  ✗ Failed to build ${name}`);
			throw error;
		}
	}

	console.log("\nCreating archives...");

	for (const { name } of TARGETS) {
		const binary = join(DIST_DIR, name);
		const archive = `${binary}.tar.gz`;

		await $`tar -czf ${archive} -C ${DIST_DIR} ${name}`.quiet();
		await $`shasum -a 256 ${archive} > ${archive}.sha256`.quiet();
		console.log(`  ✓ ${archive}`);
	}

	console.log("\nBuild complete!");
}

build().catch((err) => {
	console.error(err);
	process.exit(1);
});
