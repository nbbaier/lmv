import { mkdir } from "node:fs/promises";
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

async function readState(): Promise<StateData> {
	try {
		const file = Bun.file(getStatePath());
		return (await file.json()) as StateData;
	} catch {
		return { lastDocument: {} };
	}
}

async function writeState(state: StateData): Promise<void> {
	await mkdir(getDataDir(), { recursive: true });
	await Bun.write(getStatePath(), JSON.stringify(state, null, "\t") + "\n");
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
