import { parseArgs } from "node:util";

export type CliConfig = {
	inputs: string[];
	port: number;
	autoOpen: boolean;
	recursive: boolean;
	includeHidden: boolean;
	includeIgnored: boolean;
};

const OPTIONS = {
	port: { type: "string", short: "p" },
	help: { type: "boolean", short: "h" },
	recursive: { type: "boolean", short: "r" },
	"no-open": { type: "boolean" },
	hidden: { type: "boolean" },
	ignored: { type: "boolean" },
} as const;

function parseErrorMessage(error: unknown) {
	if (!(error instanceof Error)) return "Invalid arguments";

	const firstLine = error.message.split("\n")[0];
	if (!firstLine) return "Invalid arguments";
	if (firstLine.includes("argument missing")) {
		return "--port requires a number";
	}
	if (firstLine.startsWith("Unknown option ")) {
		return firstLine.split(". To specify")[0] ?? firstLine;
	}
	return firstLine;
}

function parseRawArgs(rawArgs: readonly string[]) {
	try {
		return parseArgs({
			args: rawArgs,
			options: OPTIONS,
			strict: true,
			allowPositionals: true,
		});
	} catch (error) {
		throw new Error(parseErrorMessage(error));
	}
}

export function parseCliArgs(rawArgs: readonly string[]): CliConfig {
	const parsed = parseRawArgs(rawArgs);

	if (parsed.positionals.length === 0) {
		throw new Error("No inputs specified");
	}

	const portValue = parsed.values.port;
	let port = 3000;
	if (portValue !== undefined) {
		if (!/^\d+$/.test(portValue)) {
			throw new Error(
				`Invalid port ${JSON.stringify(portValue)}: expected a decimal integer from 1 to 65535`,
			);
		}
		port = Number(portValue);
		if (port < 1 || port > 65535) {
			throw new Error(
				`Invalid port ${JSON.stringify(portValue)}: expected a decimal integer from 1 to 65535`,
			);
		}
	}

	return {
		inputs: parsed.positionals,
		port,
		autoOpen: !parsed.values["no-open"],
		recursive: parsed.values.recursive ?? false,
		includeHidden: parsed.values.hidden ?? false,
		includeIgnored: parsed.values.ignored ?? false,
	};
}
