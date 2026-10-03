import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

function getDataDir(): string {
	const xdg = process.env.XDG_DATA_HOME;
	const base = xdg || join(homedir(), ".local", "share");
	return join(base, "lmv");
}

function getStatePath(): string {
	return join(getDataDir(), "state.json");
}

type StateData = {
	/** Maps CWD -> last selected relative file path */
	lastDocument: Record<string, string>;
};

function parseState(raw: string): StateData {
	const data: unknown = JSON.parse(raw);
	if (typeof data !== "object" || data === null) return { lastDocument: {} };
	const record = (data as Record<string, unknown>).lastDocument;
	if (typeof record !== "object" || record === null) return { lastDocument: {} };
	const lastDocument: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		if (typeof value === "string") lastDocument[key] = value;
	}
	return { lastDocument };
}

async function readState(): Promise<StateData> {
	try {
		const raw = await readFile(getStatePath(), "utf8");
		return parseState(raw);
	} catch {
		return { lastDocument: {} };
	}
}

async function writeState(state: StateData): Promise<void> {
	await mkdir(getDataDir(), { recursive: true });
	await writeFile(getStatePath(), JSON.stringify(state, null, "\t") + "\n");
}

export async function getLastDocument(cwd: string): Promise<string | null> {
	const state = await readState();
	return state.lastDocument[cwd] ?? null;
}

export async function setLastDocument(
	cwd: string,
	relPath: string,
): Promise<void> {
	const state = await readState();
	state.lastDocument[cwd] = relPath;
	await writeState(state);
}
