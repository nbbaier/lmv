import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const binary = resolve(process.argv[2] ?? "dist/lmv");
if (!(await Bun.file(binary).exists())) {
	throw new Error(`Binary not found: ${binary}. Run bun run build first.`);
}
const workdir = await mkdtemp(join(tmpdir(), "lmv-smoke-"));
const logPath = join(workdir, "server.log");
const errorLogPath = join(workdir, "server-error.log");
await Bun.write(join(workdir, "smoke.md"), "# Compiled asset smoke check\n");

// The CLI requires a nonzero port. Reserve an available one before spawning.
const reservation = Bun.serve({ port: 0, fetch: () => new Response() });
const origin = new URL(`http://localhost:${reservation.port}`);
reservation.stop(true);
const child = Bun.spawn({
	cmd: [binary, "smoke.md", "--no-open", "--port", origin.port],
	cwd: workdir,
	env: { ...process.env, NODE_ENV: "production" },
	stdout: Bun.file(logPath),
	stderr: Bun.file(errorLogPath),
});

async function request(url: URL) {
	return fetch(url, { signal: AbortSignal.timeout(1000), redirect: "error" });
}

async function waitForRoot() {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`Binary exited during startup (${child.exitCode})`);
		}
		try {
			return await request(origin);
		} catch {
			await Bun.sleep(100);
		}
	}
	throw new Error("Binary did not serve HTTP within 15 seconds");
}

let passed = false;
try {
	const response = await waitForRoot();
	if (
		response.status !== 200 ||
		!response.headers.get("content-type")?.includes("text/html")
	) {
		throw new Error(
			`Root: expected 200 HTML, got ${response.status} ${response.headers.get("content-type")}`,
		);
	}
	const assets = new Map<string, "script" | "style">();
	const collect = (
		element: HTMLRewriterTypes.Element,
		attribute: string,
		kind: "script" | "style",
	) => {
		const value = element.getAttribute(attribute);
		if (!value) return;
		const url = new URL(value, origin);
		if (url.origin === origin.origin) assets.set(url.href, kind);
	};
	const html = await new HTMLRewriter()
		.on("script[src]", {
			element: (element) => collect(element, "src", "script"),
		})
		.on('link[rel="stylesheet"][href]', {
			element: (element) => collect(element, "href", "style"),
		})
		.transform(response)
		.text();
	if (!html.includes('id="root"') || ![...assets.values()].includes("script")) {
		throw new Error(
			"Root HTML must contain the React mount and at least one local script",
		);
	}
	for (const [url, kind] of assets) {
		const asset = await request(new URL(url));
		const mime = asset.headers.get("content-type")?.split(";")[0]?.trim();
		const validMime =
			kind === "style"
				? mime === "text/css"
				: mime === "text/javascript" || mime === "application/javascript";
		if (asset.status !== 200 || !validMime) {
			throw new Error(
				`${url}: expected 200 ${kind}, got ${asset.status} ${mime}`,
			);
		}
		const body = (await asset.text()).trim();
		if (!body || /^(?:<!doctype\s+html|<html\b)/i.test(body)) {
			throw new Error(`${url}: empty asset or HTML returned as ${kind}`);
		}
		console.log(`PASS ${kind}: ${new URL(url).pathname}`);
	}
	passed = true;
	console.log("Compiled browser assets passed");
} catch (error) {
	console.error(error);
	console.error(`Server logs retained at ${logPath}`);
	console.error(`Server errors retained at ${errorLogPath}`);
	process.exitCode = 1;
} finally {
	child.kill();
	await Promise.race([child.exited, Bun.sleep(2000)]);
	if (child.exitCode === null) child.kill("SIGKILL");
	await child.exited;
	if (passed) await rm(workdir, { recursive: true, force: true });
}
